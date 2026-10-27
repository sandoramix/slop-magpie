import { accountLabel } from "@magpie/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { exchangeOAuth } from "@/lib/api";
import { hostOf, useAccounts } from "@/stores/accounts";
import { usePendingOAuth } from "@/stores/oauth-pending";

type Step = "working" | "error" | "signup";

/**
 * Where the browser lands after a social login (`magpie://oauth?...`). A ticket is exchanged for a session;
 * a first-time identity is asked for a username (and an invite code on invite-only servers) first.
 */
export default function OAuthReturn() {
  const router = useRouter();
  const qc = useQueryClient();
  const save = useAccounts((s) => s.save);
  const pending = usePendingOAuth((s) => s.pending);
  const clearPending = usePendingOAuth((s) => s.set);
  const { status, ticket, message } = useLocalSearchParams<{ status?: string; ticket?: string; message?: string }>();
  const [step, setStep] = useState<Step>("working");
  const [problem, setProblem] = useState<string | null>(null);
  const [inviteRequired, setInviteRequired] = useState(false);
  const [username, setUsername] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const submit = async (extra: { username?: string; inviteCode?: string } = {}) => {
    if (!pending || typeof ticket !== "string") return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await exchangeOAuth(pending.url, { ticket, ...extra });
      if (res.status === "signup_required") {
        setUsername((u) => u || res.suggestedUsername);
        setInviteRequired(res.inviteRequired);
        setStep("signup");
        return;
      }
      await save({ name: `${accountLabel(res.me)} (${hostOf(pending.url)})`, url: pending.url, isAdmin: res.me.isAdmin }, res.token);
      clearPending(null);
      qc.clear();
      router.replace("/");
    } catch (e) {
      const text = e instanceof Error ? e.message : "Failed";
      // a taken name or a wrong code leaves the form open; anything else ends the attempt
      if (extra.username) setProblem(text);
      else {
        setProblem(text);
        setStep("error");
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (status === "linked") {
      void qc.invalidateQueries({ queryKey: ["identities"] });
      router.replace("/(tabs)/settings");
      return;
    }
    if (status === "error") {
      setProblem(typeof message === "string" && message ? message : "The login failed");
      setStep("error");
      return;
    }
    if (status !== "ticket" || typeof ticket !== "string") {
      setProblem("This link is not a login");
      setStep("error");
      return;
    }
    if (!pending) {
      setProblem("The app was restarted during the login. Start again.");
      setStep("error");
      return;
    }
    void submit();
  }, []);
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background p-6">
      <View className="w-full gap-4">
        {step === "working" && (
          <>
            <ActivityIndicator />
            <Text className="text-center text-muted-foreground">Signing you in…</Text>
          </>
        )}
        {step === "error" && (
          <>
            <Text variant="h3">Login failed</Text>
            <Text className="text-muted-foreground">{problem}</Text>
            <Button
              onPress={() => {
                router.replace("/");
              }}
            >
              <Text>Back</Text>
            </Button>
          </>
        )}
        {step === "signup" && (
          <>
            <Text variant="h3">Choose a username</Text>
            <Text className="text-muted-foreground">
              This is your first time here. Your username is public and cannot change later.
            </Text>
            <Input value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" autoCorrect={false} />
            {inviteRequired && (
              <Input value={inviteCode} onChangeText={setInviteCode} placeholder="Invite code" autoCapitalize="none" autoCorrect={false} />
            )}
            {problem ? <Text className="text-sm text-destructive">{problem}</Text> : null}
            <Button
              disabled={busy || username.trim().length < 3 || (inviteRequired && inviteCode.trim() === "")}
              onPress={() => {
                void submit({ username: username.trim(), ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}) });
              }}
            >
              <Text>{busy ? "Creating…" : "Create account"}</Text>
            </Button>
            <Button
              variant="ghost"
              onPress={() => {
                router.replace("/");
              }}
            >
              <Text>Cancel</Text>
            </Button>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
