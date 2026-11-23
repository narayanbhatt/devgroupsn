import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { FormError, FormScreen, TextField } from "@/components/form";
import {
  Body,
  CTAButton,
  ErrorState,
  LoadingState,
  SectionTitle,
} from "@/components/ui";
import { fetchAllCategories, type Category } from "@/data/catalogue";
import { slugify } from "@/data/product-form";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing, type } from "@/theme/tokens";

/** Catalogue categories: add, rename, reorder, hide. Hidden categories disappear from the customer catalogue. */
export default function StaffCategoriesScreen() {
  const [list, setList] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchAllCategories()
      .then((c) => {
        if (cancelled) return;
        setList(c);
        setLoadError(null);
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function run(
    work: PromiseLike<{ error: { code?: string; message: string } | null }>,
  ) {
    setBusy(true);
    setError(null);
    const { error: e } = await work;
    setBusy(false);
    if (e)
      setError(
        e.code === "23505"
          ? "A category with that name already exists."
          : friendlyError(e),
      );
    load();
    return !e;
  }

  async function onAdd() {
    const n = name.trim();
    const slug = slugify(n);
    if (!n || !slug) return setError("Enter a category name.");
    const sort_order = Math.max(0, ...(list ?? []).map((c) => c.sortOrder)) + 1;
    if (
      await run(
        supabase!.from("categories").insert({ name: n, slug, sort_order }),
      )
    )
      setName("");
  }

  // Alert.prompt is iOS-only, so renaming happens inline.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  );
  async function onRenameSave() {
    if (!editing?.name.trim()) return setError("Enter a category name.");
    if (
      await run(
        supabase!
          .from("categories")
          .update({ name: editing.name.trim() })
          .eq("id", editing.id),
      )
    )
      setEditing(null);
  }

  async function onMove(index: number, dir: -1 | 1) {
    if (!list) return;
    const other = list[index + dir];
    const me = list[index];
    if (!other) return;
    // Swap the two positions.
    setBusy(true);
    const results = await Promise.all([
      supabase!
        .from("categories")
        .update({ sort_order: other.sortOrder })
        .eq("id", me.id),
      supabase!
        .from("categories")
        .update({ sort_order: me.sortOrder })
        .eq("id", other.id),
    ]);
    setBusy(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) setError(friendlyError(failed.error));
    load();
  }

  function onToggle(c: Category) {
    const verb = c.isActive ? "Hide" : "Show";
    Alert.alert(
      `${verb} ${c.name}?`,
      c.isActive
        ? "Customers will no longer see this category. Its products stay as they are; set them to Draft or Archived to hide them too."
        : "Customers will see this category again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: verb,
          onPress: () =>
            void run(
              supabase!
                .from("categories")
                .update({ is_active: !c.isActive })
                .eq("id", c.id),
            ),
        },
      ],
    );
  }

  if (loadError && !list)
    return <ErrorState message={loadError} onRetry={load} />;
  if (!list) return <LoadingState />;

  return (
    <FormScreen>
      <FormError message={error} />
      {list.length === 0 && <Body muted>No categories yet.</Body>}
      {list.map((c, i) =>
        editing?.id === c.id ? (
          <View key={c.id} style={{ gap: spacing.sm }}>
            <TextField
              label="Category name"
              value={editing.name}
              onChangeText={(v) => setEditing({ id: c.id, name: v })}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <RowButton label="Save" onPress={onRenameSave} disabled={busy} />
              <RowButton label="Cancel" onPress={() => setEditing(null)} />
            </View>
          </View>
        ) : (
          <View
            key={c.id}
            style={[styles.row, !c.isActive && { opacity: 0.6 }]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  type.body,
                  { color: colors.textPrimary, fontWeight: "600" },
                ]}
              >
                {c.name}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {c.isActive ? "Shown to customers" : "Hidden"}
              </Text>
            </View>
            <RowButton
              label="↑"
              a11y={`Move ${c.name} up`}
              onPress={() => onMove(i, -1)}
              disabled={busy || i === 0}
            />
            <RowButton
              label="↓"
              a11y={`Move ${c.name} down`}
              onPress={() => onMove(i, 1)}
              disabled={busy || i === list.length - 1}
            />
            <RowButton
              label="Rename"
              onPress={() => setEditing({ id: c.id, name: c.name })}
              disabled={busy}
            />
            <RowButton
              label={c.isActive ? "Hide" : "Show"}
              onPress={() => onToggle(c)}
              disabled={busy}
            />
          </View>
        ),
      )}
      <SectionTitle>Add a category</SectionTitle>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Water supply"
      />
      <CTAButton
        label={busy ? "Saving…" : "Add category"}
        onPress={onAdd}
        disabled={busy}
      />
    </FormScreen>
  );
}

function RowButton({
  label,
  a11y,
  onPress,
  disabled,
}: {
  label: string;
  a11y?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={[styles.rowButton, disabled && { opacity: 0.3 }]}
    >
      <Text
        style={[
          type.caption,
          { color: colors.brandPrimary, fontWeight: "700" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  rowButton: {
    minWidth: 36,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
