import { useMutation, useQuery } from "@apollo/client/react";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CREATE_CATEGORY,
  UPDATE_CATEGORY,
  DELETE_CATEGORY,
} from "@ctrend/shared/graphql/admin";
import { CATEGORIES } from "@ctrend/shared/graphql/feed";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

type Category = {
  id: string;
  name: string;
  slug?: string | null;
};

type CategoriesData = { categories: Category[] };

export default function CategoriesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data, loading, refetch } = useQuery<CategoriesData>(CATEGORIES, {
    fetchPolicy: "cache-and-network",
  });

  const [createMut, { loading: creating }] = useMutation(CREATE_CATEGORY);
  const [updateMut, { loading: updating }] = useMutation(UPDATE_CATEGORY);
  const [deleteMut] = useMutation(DELETE_CATEGORY);

  const categories = data?.categories ?? [];

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createMut({ variables: { name } });
      setNewName("");
      void refetch();
      showToast("Category created", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create category";
      showToast(msg, "error");
    }
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditingName(cat.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function handleUpdate(id: string) {
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateMut({ variables: { id, name } });
      setEditingId(null);
      setEditingName("");
      void refetch();
      showToast("Category updated", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update category";
      showToast(msg, "error");
    }
  }

  async function handleDelete(cat: Category) {
    Alert.alert(
      "Delete Category",
      `Delete "${cat.name}"? Posts in this category may be affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMut({ variables: { id: cat.id } });
              void refetch();
              showToast("Category deleted", "success");
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "Failed to delete category";
              showToast(msg, "error");
            }
          },
        },
      ],
    );
  }

  const st = makeStyles(colors);

  return (
    <View style={[st.screen, { paddingBottom: insets.bottom }]}>
      <ToastView />

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[st.sectionTitle, { color: colors.text }]}>Post Categories</Text>
          <Text style={[st.sectionSub, { color: colors.muted }]}>Categories users pick when creating compares</Text>
        </View>

        {/* Add new */}
        <View style={st.addRow}>
          <View style={[st.addInputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[st.addIcon, { color: colors.muted }]}>+</Text>
            <TextInput
              style={[st.addInput, { color: colors.text }]}
              placeholder="New category name (e.g. Music)"
              placeholderTextColor={colors.muted}
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={() => void handleCreate()}
              returnKeyType="done"
            />
          </View>
          <Pressable
            style={[st.addBtn, { backgroundColor: colors.accent }, (creating || !newName.trim()) && { opacity: 0.5 }]}
            onPress={() => void handleCreate()}
            disabled={creating || !newName.trim()}
          >
            {creating
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={st.addBtnText}>Add Category</Text>}
          </Pressable>
        </View>
      </View>

      {/* Column headers */}
      <View style={[st.tableHeader, { backgroundColor: colors.section, borderBottomColor: colors.border }]}>
        <Text style={[st.tableHeaderCell, { color: colors.muted, flex: 2 }]}>Name</Text>
        <Text style={[st.tableHeaderCell, { color: colors.muted, flex: 2 }]}>Slug</Text>
        <Text style={[st.tableHeaderCell, { color: colors.muted, flex: 1.5, textAlign: "right" }]}>Actions</Text>
      </View>

      {loading && categories.length === 0 ? (
        <View style={st.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          contentContainerStyle={st.list}
          ListEmptyComponent={<Text style={[st.empty, { color: colors.muted }]}>No categories yet</Text>}
          renderItem={({ item: cat }) => {
            const isEditing = editingId === cat.id;
            return (
              <View style={[st.row, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                {isEditing ? (
                  <>
                    <TextInput
                      style={[st.editInput, { flex: 2, color: colors.text, borderColor: colors.accent, backgroundColor: colors.inputBg }]}
                      value={editingName}
                      onChangeText={setEditingName}
                      autoFocus
                      onSubmitEditing={() => void handleUpdate(cat.id)}
                      returnKeyType="done"
                    />
                    <View style={[st.rowActions, { flex: 1.5 }]}>
                      <Pressable
                        style={[st.actionBtn, { borderColor: colors.accent }, updating && { opacity: 0.5 }]}
                        onPress={() => void handleUpdate(cat.id)}
                        disabled={updating}
                      >
                        {updating
                          ? <ActivityIndicator size="small" color={colors.accent} />
                          : <Text style={[st.actionBtnText, { color: colors.accent }]}>Save</Text>}
                      </Pressable>
                      <Pressable
                        style={[st.actionBtn, { borderColor: colors.border }]}
                        onPress={cancelEdit}
                      >
                        <Text style={[st.actionBtnText, { color: colors.muted }]}>Cancel</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[st.cellName, { flex: 2, color: colors.text }]}>{cat.name}</Text>
                    <Text style={[st.cellSlug, { flex: 2, color: colors.muted }]}>{cat.slug ?? "—"}</Text>
                    <View style={[st.rowActions, { flex: 1.5 }]}>
                      <Pressable
                        style={[st.actionBtn, { borderColor: colors.accent }]}
                        onPress={() => startEdit(cat)}
                      >
                        <Text style={[st.actionBtnText, { color: colors.accent }]}>Edit</Text>
                      </Pressable>
                      <Pressable
                        style={[st.actionBtn, { borderColor: "#f87171" }]}
                        onPress={() => void handleDelete(cat)}
                      >
                        <Text style={[st.actionBtnText, { color: "#f87171" }]}>Delete</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: { padding: 12, borderBottomWidth: 1, gap: 12 },
    sectionTitle: { fontSize: 16, fontWeight: "800" },
    sectionSub: { fontSize: 12, marginTop: 2 },
    addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    addInputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 10,
      gap: 6,
    },
    addIcon: { fontSize: 16, fontWeight: "300" },
    addInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
    addBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
    addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    tableHeader: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
    tableHeaderCell: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
    list: { paddingBottom: 20 },
    empty: { textAlign: "center", padding: 24, fontSize: 14 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      gap: 8,
    },
    cellName: { fontSize: 14, fontWeight: "600" },
    cellSlug: { fontSize: 13 },
    editInput: {
      borderRadius: 8,
      borderWidth: 1.5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      fontSize: 14,
    },
    rowActions: { flexDirection: "row", gap: 6, justifyContent: "flex-end" },
    actionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
    actionBtnText: { fontSize: 12, fontWeight: "700" },
  });
}
