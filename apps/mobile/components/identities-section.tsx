import { oauthProviders, type OAuthProvider } from "@magpie/shared/api";
import { useQuery } from "@tanstack/react-query";
import { Linking, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { fetchAuthConfig } from "@/lib/api";
import { fetchLinkUrl, useIdentities, useUnlinkIdentity } from "@/lib/social-queries";
import { useActiveAccount } from "@/stores/accounts";
import { usePendingOAuth } from "@/stores/oauth-pending";

const LABELS: Record<OAuthProvider, string> = { google: "Google", github: "GitHub", discord: "Discord" };

/** Settings: which social logins are linked to this account, and the ones the server lets you add. */
export function IdentitiesSection() {
  const account = useActiveAccount();
  const identities = useIdentities();
  const unlink = useUnlinkIdentity();
  const setPending = usePendingOAuth((s) => s.set);
  const config = useQuery({
    queryKey: ["auth-config", account?.url ?? ""],
    enabled: account !== null,
    queryFn: () => fetchAuthConfig(account?.url ?? ""),
    staleTime: 60_000,
    retry: false,
  });
  const enabled = config.data?.providers ?? [];
  const linked = identities.data?.identities ?? [];

  const link = async (provider: OAuthProvider) => {
    if (!account) return;
    try {
      const url = await fetchLinkUrl(provider);
      setPending({ url: account.url, provider });
      await Linking.openURL(url);
    } catch (e) {
      alert("Couldn't start the login", e instanceof Error ? e.message : "Failed");
    }
  };

  const confirmUnlink = (provider: OAuthProvider) => {
    alert(`Remove ${LABELS[provider]}?`, "You will no longer be able to sign in with it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          unlink.mutate(provider, { onError: (e) => { alert("Failed", e.message); } });
        },
      },
    ]);
  };

  return (
    <View className="gap-3 rounded-xl border border-border p-4">
      <Text className="font-medium">Social login</Text>
      <Text className="text-sm text-muted-foreground">
        Link Google, GitHub or Discord to sign in without a password. Greyed-out ones are not set up on this server.
      </Text>
      {oauthProviders.map((p) => {
        const entry = linked.find((l) => l.provider === p);
        return (
          <View key={p} className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text>{LABELS[p]}</Text>
              {entry ? <Text className="text-xs text-muted-foreground">{entry.email ?? "Linked"}</Text> : null}
            </View>
            {entry ? (
              <Button
                size="sm"
                variant="outline"
                disabled={unlink.isPending}
                onPress={() => {
                  confirmUnlink(p);
                }}
              >
                <Text>Remove</Text>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={!enabled.includes(p)}
                onPress={() => {
                  void link(p);
                }}
              >
                <Text>Link</Text>
              </Button>
            )}
          </View>
        );
      })}
    </View>
  );
}
