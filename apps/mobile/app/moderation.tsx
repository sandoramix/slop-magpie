import type { Report, ReportStatus } from "@magpie/shared/api";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Share, View } from "react-native";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useHiddenItems, useRestore, useSuspendedAccounts } from "@/lib/organize-queries";
import { useCreateInvite, useReports, useResolveReport } from "@/lib/social-queries";
import { useActiveAccount } from "@/stores/accounts";

type View_ = ReportStatus | "hidden" | "suspended";

const STATUSES: { key: View_; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "actioned", label: "Handled" },
  { key: "dismissed", label: "Dismissed" },
  { key: "hidden", label: "Hidden posts" },
  { key: "suspended", label: "Suspended" },
];

function ReportRow({ report }: { report: Report }) {
  const resolve = useResolveReport();
  const fail = (e: Error) => {
    alert("Failed", e.message);
  };
  const run = (action: "hide" | "suspend" | "dismiss", verb: string, detail: string) => {
    alert(`${verb}?`, detail, [
      { text: "Cancel", style: "cancel" },
      {
        text: verb,
        style: action === "dismiss" ? "default" : "destructive",
        onPress: () => {
          resolve.mutate({ id: report.id, action }, { onError: fail });
        },
      },
    ]);
  };

  return (
    <View className="gap-2 border-b border-border px-4 py-3">
      <Text className="font-medium">{report.target === "item" ? (report.itemTitle ?? "A post") : `@${report.targetUser ?? "unknown"}`}</Text>
      <Text className="text-sm text-muted-foreground">
        “{report.reason}” · reported by @{report.reporter} · {new Date(report.createdAt).toLocaleDateString()}
      </Text>
      {report.status === "open" && (
        <View className="flex-row flex-wrap gap-2">
          {report.itemId && (
            <Button
              size="sm"
              variant="outline"
              disabled={resolve.isPending}
              onPress={() => {
                run("hide", "Hide post", "It disappears from every public view. Its owner keeps it.");
              }}
            >
              <Text>Hide post</Text>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={resolve.isPending}
            onPress={() => {
              run("suspend", "Suspend account", "The account is signed out everywhere and hidden with its posts.");
            }}
          >
            <Text>Suspend account</Text>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={resolve.isPending}
            onPress={() => {
              run("dismiss", "Dismiss", "Close the report without action.");
            }}
          >
            <Text>Dismiss</Text>
          </Button>
        </View>
      )}
    </View>
  );
}

/** Admin: reports from users, and single-use invite codes for people who sign up themselves. */
export default function ModerationScreen() {
  const [status, setStatus] = useState<View_>("open");
  const account = useActiveAccount();
  const isAdmin = account?.isAdmin === true;
  const isReports = status !== "hidden" && status !== "suspended";
  const reports = useReports(isReports ? status : "open", isAdmin && isReports);
  const hidden = useHiddenItems(isAdmin && status === "hidden");
  const suspended = useSuspendedAccounts(isAdmin && status === "suspended");
  const restore = useRestore();
  const invite = useCreateInvite();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);

  const makeInvite = () => {
    invite.mutate(undefined, {
      onSuccess: setCode,
      onError: (e) => {
        alert("Failed", e.message);
      },
    });
  };

  const header = (
    <View className="gap-3 p-4">
      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <Text className="font-semibold">Invite code</Text>
        <Text className="text-sm text-muted-foreground">One person can sign up with it, within 14 days. Needed while registration is invite-only.</Text>
        <Button disabled={invite.isPending} onPress={makeInvite}>
          <Text>New invite code</Text>
        </Button>
        {code ? (
          <View className="gap-2">
            <Text selectable className="text-base font-semibold">
              {code.code}
            </Text>
            <View className="flex-row gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onPress={() => {
                  void Clipboard.setStringAsync(code.code);
                }}
              >
                <Text>Copy</Text>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onPress={() => {
                  void Share.share({ message: `Your Magpie invite code: ${code.code}` });
                }}
              >
                <Text>Share</Text>
              </Button>
            </View>
          </View>
        ) : null}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Chip
            key={s.key}
            label={s.label}
            active={status === s.key}
            onPress={() => {
              setStatus(s.key);
            }}
          />
        ))}
      </View>
    </View>
  );

  const restoreRow = (kind: "item" | "user", id: string, title: string, detail: string) => (
    <View key={id} className="flex-row items-center gap-3 border-b border-border px-4 py-3">
      <View className="flex-1">
        <Text className="font-medium">{title}</Text>
        <Text className="text-xs text-muted-foreground">{detail}</Text>
      </View>
      <Button
        size="sm"
        variant="outline"
        disabled={restore.isPending}
        onPress={() => {
          restore.mutate({ kind, id }, { onError: (e) => { alert("Failed", e.message); } });
        }}
      >
        <Text>Restore</Text>
      </Button>
    </View>
  );

  // one list, three kinds of rows
  const query = status === "hidden" ? hidden : status === "suspended" ? suspended : reports;
  const rows: { key: string; node: React.ReactNode }[] =
    status === "hidden"
      ? (hidden.data ?? []).map((i) => ({ key: i.id, node: restoreRow("item", i.id, i.title ?? "Untitled post", `by @${i.owner} · hidden ${new Date(i.hiddenAt).toLocaleDateString()}`) }))
      : status === "suspended"
        ? (suspended.data ?? []).map((a) => ({ key: a.id, node: restoreRow("user", a.id, `@${a.name}`, `suspended ${new Date(a.suspendedAt).toLocaleDateString()}`) }))
        : (reports.data ?? []).map((r) => ({ key: r.id, node: <ReportRow report={r} /> }));

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        renderItem={({ item }) => <>{item.node}</>}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              void query.refetch();
            }}
          />
        }
        ListEmptyComponent={
          query.isPending ? (
            <ActivityIndicator className="py-12" />
          ) : (
            <View className="items-center px-8 py-16">
              <Text className="text-center text-muted-foreground">
                {status === "open" ? "No open reports." : status === "hidden" ? "No hidden posts." : status === "suspended" ? "No suspended accounts." : "Nothing here."}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
