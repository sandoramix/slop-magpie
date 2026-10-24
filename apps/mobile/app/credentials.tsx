import { Stack } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ScrollView, View } from "react-native";
import type { CredentialKind } from "@magpie/shared/api";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useCheckSession, useCredentials, useDeleteCredential, useSetCredential } from "@/lib/queries";

const SOURCE = "instagram";

const when = (iso: string) => new Date(iso).toLocaleString();

/** Admin: replace the Instagram session or cookies without touching the server. */
export default function CredentialsScreen() {
  const status = useCredentials(SOURCE, true);
  const set = useSetCredential(SOURCE);
  const remove = useDeleteCredential(SOURCE);
  const check = useCheckSession(SOURCE);

  const fail = (e: Error) => {
    alert("Failed", e.message);
  };
  const upload = (kind: CredentialKind, content: string) => {
    set.mutate(
      { kind, content },
      {
        onSuccess: () => {
          alert("Uploaded", "The server is checking the new login now. The result shows here in a moment.");
        },
        onError: fail,
      },
    );
  };

  const pickFile = async (kind: CredentialKind) => {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: "*/*" });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    try {
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: kind === "session" ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
      });
      upload(kind, content);
    } catch (e) {
      fail(e instanceof Error ? e : new Error("Could not read the file"));
    }
  };

  const pasteCookies = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text.trim()) {
      alert("Clipboard is empty", "Copy the contents of your cookies.txt first.");
      return;
    }
    upload("cookies", text);
  };

  const data = status.data;
  const state = data?.state;

  return (
    <>
      <Stack.Screen options={{ title: "Instagram login" }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4">
        <View className="gap-1 rounded-xl border border-border bg-card p-4">
          <Text className="text-lg font-semibold">
            {state ? (state.value === "ok" ? "Session works" : "Session expired") : "Session not checked yet"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {state ? `Last checked ${when(state.checkedAt)}.` : "The server checks it every 6 hours and after each upload."}
          </Text>
          {state?.value === "dead" && (
            <Text className="text-sm text-destructive">Instagram saves keep only a preview until you upload a fresh session. They are downloaded again automatically afterwards.</Text>
          )}
          <Button
            variant="outline"
            className="mt-2"
            disabled={check.isPending}
            onPress={() => {
              check.mutate(undefined, { onError: fail });
            }}
          >
            <Text>Check now</Text>
          </Button>
        </View>

        <View className="gap-2 rounded-xl border border-border p-4">
          <Text className="font-medium">Session file</Text>
          <Text className="text-xs text-muted-foreground">
            {data?.session ? `Uploaded ${when(data.session.updatedAt)}.` : "Nothing uploaded; the server uses its own login."}
          </Text>
          <Button
            onPress={() => {
              void pickFile("session");
            }}
            disabled={set.isPending}
          >
            <Text>Upload session file</Text>
          </Button>
          <Text className="text-xs text-muted-foreground">
            Create it on a PC where you are logged in to the account in Firefox: instaloader --load-cookies firefox --sessionfile instagram.session. Then send the file to this phone. A session made in a real browser lasts far longer than one the server creates.
          </Text>
        </View>

        <View className="gap-2 rounded-xl border border-border p-4">
          <Text className="font-medium">Cookies</Text>
          <Text className="text-xs text-muted-foreground">
            {data?.cookies ? `Uploaded ${when(data.cookies.updatedAt)}.` : "Nothing uploaded; the server uses its cookie file, if any."}
          </Text>
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              variant="outline"
              disabled={set.isPending}
              onPress={() => {
                void pickFile("cookies");
              }}
            >
              <Text>Upload cookies.txt</Text>
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              disabled={set.isPending}
              onPress={() => {
                void pasteCookies();
              }}
            >
              <Text>Paste from clipboard</Text>
            </Button>
          </View>
          {data?.cookies && (
            <Button
              variant="ghost"
              onPress={() => {
                remove.mutate("cookies", { onError: fail });
              }}
            >
              <Text className="text-destructive">Remove uploaded cookies</Text>
            </Button>
          )}
          <Text className="text-xs text-muted-foreground">Used by yt-dlp and gallery-dl when the session file is not enough. Export in Netscape format while logged in to Instagram.</Text>
        </View>
      </ScrollView>
    </>
  );
}
