import { accountLabel, MIN_PASSWORD_LENGTH, type MeResponse } from "@magpie/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { checkServer, loginWithPassword, signUp } from "@/lib/api";
import { parseInvite } from "@/lib/invite";
import { env } from "@/src/env";
import { type Account, useAccounts } from "@/stores/accounts";

type Props = {
  /** Editing an existing account; omit to add one. */
  account?: Account;
  onDone: () => void;
};

type Mode = "token" | "password" | "signup";

const hostOnly = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");

/**
 * First sign-in uses the access token the admin generated; after the person has set a password,
 * username + password works on any device. Either way the app keeps one bearer token per account.
 */
export function AccountForm({ account, onDone }: Props) {
  const qc = useQueryClient();
  const save = useAccounts((s) => s.save);
  const [mode, setMode] = useState<Mode>("token");
  const [name, setName] = useState(account?.name ?? "");
  const [url, setUrl] = useState(account?.url ?? env.EXPO_PUBLIC_DEFAULT_API_URL ?? "");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (me: MeResponse, bearer: string) => {
    await save(
      {
        ...(account ? { id: account.id } : {}),
        name: name.trim() || `${accountLabel(me)} (${hostOnly(url)})`,
        url,
        isAdmin: me.isAdmin,
      },
      bearer,
    );
    qc.clear();
    onDone();
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "token") {
        const { me } = await checkServer(url, token.trim());
        await finish(me, token.trim());
      } else if (mode === "signup") {
        const created = await signUp(url, username, password, inviteCode);
        await finish(created.me, created.token);
      } else {
        const login = await loginWithPassword(url, username, password);
        await finish(login.me, login.token);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  // an invite message (or its app link) fills in the server and token in one go
  const pasteInvite = async () => {
    const invite = parseInvite(await Clipboard.getStringAsync());
    if (!invite) {
      setError("No invite found on the clipboard. Copy the whole invite message first.");
      return;
    }
    setUrl(invite.url);
    setToken(invite.token);
    setMode("token");
    setError(null);
  };

  const ready =
    url.trim() !== "" &&
    (mode === "token" ? token.trim() !== "" : username.trim() !== "" && (mode === "signup" ? password.length >= MIN_PASSWORD_LENGTH : password !== ""));

  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <Chip
          label="Access token"
          active={mode === "token"}
          onPress={() => {
            setMode("token");
            setError(null);
          }}
        />
        <Chip
          label="Username & password"
          active={mode === "password"}
          onPress={() => {
            setMode("password");
            setError(null);
          }}
        />
        {account ? null : (
          <Chip
            label="Sign up"
            active={mode === "signup"}
            onPress={() => {
              setMode("signup");
              setError(null);
            }}
          />
        )}
      </View>
      {account ? null : (
        <Button
          variant="secondary"
          onPress={() => {
            void pasteInvite();
          }}
        >
          <Text>Paste invite</Text>
        </Button>
      )}
      <Input value={name} onChangeText={setName} placeholder="Name on this device (optional)" autoCapitalize="words" />
      <Input
        value={url}
        onChangeText={setUrl}
        placeholder="https://magpie.example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {mode === "token" ? (
        <>
          <Input
            value={token}
            onChangeText={setToken}
            placeholder={account ? "Token (enter it again to save changes)" : "Access token"}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text className="text-xs text-muted-foreground">
            First time? Use the token you were given. It works until you choose a password.
          </Text>
        </>
      ) : (
        <>
          <Input value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" autoCorrect={false} />
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder={mode === "signup" ? `Password (at least ${MIN_PASSWORD_LENGTH} characters)` : "Password"}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          {mode === "signup" && (
            <>
              <Input value={inviteCode} onChangeText={setInviteCode} placeholder="Invite code (if the server asks for one)" autoCapitalize="none" autoCorrect={false} />
              <Text className="text-xs text-muted-foreground">
                Letters, digits, dots, dashes and underscores. Your username is public and cannot change later.
              </Text>
            </>
          )}
        </>
      )}
      <Button
        disabled={busy || !ready}
        onPress={() => {
          void connect();
        }}
      >
        <Text>{busy ? "Checking…" : account ? "Test and save" : mode === "signup" ? "Create account" : "Connect"}</Text>
      </Button>
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}
