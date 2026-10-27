import type { Report, ReportStatus } from "@magpie/shared/api";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Share, View } from "react-native";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useCreateInvite, useReports, useResolveReport } from "@/lib/social-queries";
import { useActiveAccount } from "@/stores/accounts";

const STATUSES: { key: ReportStatus; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "actioned", label: "Handled" },
  { key: "dismissed", label: "Dismissed" },
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
  const [status, setStatus] = useState<ReportStatus>("open");
  const account = useActiveAccount();
  const reports = useReports(status, account?.isAdmin === true);
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
      <View className="flex-row gap-2">
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

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={reports.data ?? []}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <ReportRow report={item} />}
        refreshControl={
          <RefreshControl
            refreshing={reports.isRefetching}
            onRefresh={() => {
              void reports.refetch();
            }}
          />
        }
        ListEmptyComponent={
          reports.isPending ? (
            <ActivityIndicator className="py-12" />
          ) : (
            <View className="items-center px-8 py-16">
              <Text className="text-center text-muted-foreground">{status === "open" ? "No open reports." : "Nothing here."}</Text>
            </View>
          )
        }
      />
    </View>
  );
}
