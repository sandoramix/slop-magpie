import { oauthProviders, type OAuthProvider } from "@magpie/shared/api";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { fetchAuthConfig, startOAuth } from "@/lib/api";
import { alert } from "@/lib/alert";
import { usePendingOAuth } from "@/stores/oauth-pending";

const LABELS: Record<OAuthProvider, string> = { google: "Google", github: "GitHub", discord: "Discord" };

/**
 * Continue with Google, GitHub or Discord. All three buttons are always shown; each is enabled only when the
 * server reports that provider as configured (`GET /auth/config`), so a server that has not set one up shows it greyed out.
 */
export function SocialLogin({ url, verb = "Continue" }: { url: string; verb?: string }) {
  const setPending = usePendingOAuth((s) => s.set);
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const trimmed = url.trim();
  const valid = /^https?:\/\/[^/]+\.[^/]+/i.test(trimmed) || /^https?:\/\/(localhost|\d+\.\d+\.\d+\.\d+)/i.test(trimmed);
  const config = useQuery({
    queryKey: ["auth-config", trimmed],
    enabled: valid,
    queryFn: () => fetchAuthConfig(trimmed),
    staleTime: 60_000,
    retry: false,
  });
  const enabled = config.data?.providers ?? [];

  const start = async (provider: OAuthProvider) => {
    setBusy(provider);
    try {
      const target = await startOAuth(trimmed, provider);
      setPending({ url: trimmed, provider });
      await Linking.openURL(target);
    } catch (e) {
      alert("Couldn't start the login", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-2">
      <Text className="text-center text-xs text-muted-foreground">or</Text>
      {oauthProviders.map((p) => (
        <Button
          key={p}
          variant="outline"
          disabled={!enabled.includes(p) || busy !== null}
          onPress={() => {
            void start(p);
          }}
        >
          <Text>
            {verb} with {LABELS[p]}
          </Text>
        </Button>
      ))}
      <Text className="text-center text-xs text-muted-foreground">
        {!valid
          ? "Enter the server address to see which logins it offers."
          : config.isPending
            ? "Checking what this server offers…"
            : enabled.length === 0
              ? "This server has not turned on social login."
              : "Greyed-out logins are not set up on this server."}
      </Text>
    </View>
  );
}
