import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ME, UPDATE_PROFILE } from "@ctrend/shared/graphql/profile";
import { GET_IMAGE_UPLOAD_URL } from "@ctrend/shared/graphql/upload";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

// ─── Types ────────────────────────────────────────────────────────────────────

type MeData = {
  me: {
    id: string;
    email: string;
    username?: string | null;
    displayName?: string | null;
    bio?: string | null;
    interests?: string[] | null;
    profileImageUrl?: string | null;
  };
};

type UploadUrlData = {
  getImageUploadUrl: { uploadUrl: string; publicUrl: string; key: string };
};

// ─── Predefined interests ─────────────────────────────────────────────────────

const INTEREST_OPTIONS = [
  "Sports", "Music", "Gaming", "Movies", "Travel",
  "Food", "Fashion", "Art", "Technology", "Fitness",
  "Photography", "Books", "Politics", "Science", "Anime",
  "Cricket", "Football", "Comedy", "Nature", "Business",
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { patchUser } = useAuth();
  const { showToast, ToastView } = useToast();

  const { data, loading: meLoading } = useQuery<MeData>(ME, {
    fetchPolicy: "cache-first",
  });
  const me = data?.me;

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarPublicUrl, setAvatarPublicUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [getUploadUrl] = useMutation<UploadUrlData>(GET_IMAGE_UPLOAD_URL);
  const [updateProfile, { loading: saving }] = useMutation(UPDATE_PROFILE);

  // Prefill fields once ME query returns
  useEffect(() => {
    if (me && !initialized) {
      setDisplayName(me.displayName?.trim() ?? "");
      setBio(me.bio?.trim() ?? "");
      setInterests(me.interests ?? []);
      setInitialized(true);
    }
  }, [me, initialized]);

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Gallery access is required to change your avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const mimeType = asset.mimeType ?? "image/jpeg";
    const ext = mimeType.split("/")[1] ?? "jpg";
    const filename = asset.fileName ?? `avatar_${Date.now()}.${ext}`;

    setAvatarUri(uri);
    setAvatarUploading(true);
    try {
      const { data: urlData } = await getUploadUrl({ variables: { filename, contentType: mimeType } });
      if (!urlData?.getImageUploadUrl) throw new Error("Could not get upload URL");
      const { uploadUrl, publicUrl } = urlData.getImageUploadUrl;

      let uploadUri = uri;
      if (Platform.OS === "android" && !uri.startsWith("file://")) {
        uploadUri = `${FileSystem.cacheDirectory}avatar_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: uploadUri });
      }

      const res = await FileSystem.uploadAsync(uploadUrl, uploadUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeType },
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed: ${res.status}`);

      setAvatarPublicUrl(publicUrl);
    } catch (e: unknown) {
      setAvatarUri(null);
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload image");
    } finally {
      setAvatarUploading(false);
    }
  }

  function toggleInterest(tag: string) {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleSave() {
    const input: Record<string, unknown> = {
      displayName: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
      interests,
    };
    if (avatarPublicUrl) input.profileImageUrl = avatarPublicUrl;

    try {
      const { data: res } = await updateProfile({ variables: { input } });
      const updated = res?.updateProfile;
      if (updated) {
        await patchUser({
          displayName: updated.displayName,
          profileImageUrl: updated.profileImageUrl,
        });
      }
      showToast("Profile saved ✓", "success");
      setTimeout(() => router.back(), 800);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Could not save profile", "error");
    }
  }

  const currentAvatar = avatarUri
    ? avatarUri
    : normalizeProfileImageUrl(me?.profileImageUrl);
  const name = me?.displayName?.trim() || me?.username || "You";
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <View style={[s.flex, { backgroundColor: colors.bg }]}>
      <ToastView />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Edit Profile",
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.topbar },
          headerTitleStyle: { color: colors.text, fontWeight: "800" },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={{ paddingHorizontal: 4 }}>
              <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "700" }}>← Back</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => void handleSave()}
              disabled={saving || avatarUploading}
              hitSlop={8}
              style={{ paddingHorizontal: 4 }}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "800" }}>Save</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          style={s.flex}
          contentContainerStyle={[s.content, { paddingTop: 24, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          {meLoading && !initialized ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* Avatar */}
              <View style={s.avatarSection}>
                <Pressable onPress={() => void pickAvatar()} style={s.avatarWrap}>
                  {currentAvatar ? (
                    <Image source={{ uri: currentAvatar }} style={s.avatar} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <View style={[s.avatar, s.avatarFallback]}>
                      <Text style={s.avatarInitial}>{initial}</Text>
                    </View>
                  )}
                  <View style={[s.avatarOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
                    {avatarUploading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={s.avatarOverlayText}>📷</Text>}
                  </View>
                </Pressable>
                <Text style={[s.avatarHint, { color: colors.muted }]}>
                  {avatarUploading ? "Uploading…" : "Tap to change photo"}
                </Text>
              </View>

              {/* Display name */}
              <View style={[s.fieldGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.fieldLabel, { color: colors.subtext }]}>DISPLAY NAME</Text>
                <TextInput
                  style={[s.fieldInput, { color: colors.text, borderBottomColor: colors.border }]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your display name"
                  placeholderTextColor={colors.muted}
                  maxLength={50}
                  returnKeyType="next"
                />
              </View>

              {/* Bio */}
              <View style={[s.fieldGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.fieldLabel, { color: colors.subtext }]}>BIO</Text>
                <TextInput
                  style={[s.fieldInput, s.bioInput, { color: colors.text }]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell people about yourself…"
                  placeholderTextColor={colors.muted}
                  maxLength={160}
                  multiline
                  returnKeyType="default"
                />
                <Text style={[s.charCount, { color: colors.muted }]}>{bio.length}/160</Text>
              </View>

              {/* Interests */}
              <View style={[s.fieldGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.fieldLabel, { color: colors.subtext }]}>INTERESTS</Text>
                <View style={s.tagsWrap}>
                  {INTEREST_OPTIONS.map((tag) => {
                    const active = interests.includes(tag);
                    return (
                      <Pressable
                        key={tag}
                        onPress={() => toggleInterest(tag)}
                        style={[
                          s.tag,
                          { borderColor: active ? colors.accent : colors.border },
                          active && { backgroundColor: colors.accent + "22" },
                        ]}
                      >
                        <Text style={[s.tagText, { color: active ? colors.accent : colors.subtext }]}>
                          {tag}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Save button (bottom) */}
              <Pressable
                style={[s.saveBtn, { backgroundColor: colors.accent }, (saving || avatarUploading) && { opacity: 0.6 }]}
                onPress={() => void handleSave()}
                disabled={saving || avatarUploading}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>Save Changes</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },

  avatarSection: { alignItems: "center", marginBottom: 8 },
  avatarWrap: { width: 96, height: 96, borderRadius: 48, overflow: "hidden", marginBottom: 10 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { backgroundColor: "#312e81", justifyContent: "center", alignItems: "center" },
  avatarInitial: { color: "#fff", fontSize: 38, fontWeight: "700" },
  avatarOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 48, justifyContent: "center", alignItems: "center",
  },
  avatarOverlayText: { fontSize: 24 },
  avatarHint: { fontSize: 12, marginTop: 2 },

  fieldGroup: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
  },
  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 8 },
  fieldInput: {
    fontSize: 15, paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bioInput: { minHeight: 72, textAlignVertical: "top", paddingTop: 4 },
  charCount: { fontSize: 11, textAlign: "right", marginTop: 6 },

  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  tag: {
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1,
  },
  tagText: { fontSize: 13, fontWeight: "600" },

  saveBtn: {
    borderRadius: 14, paddingVertical: 15, alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
