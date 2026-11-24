import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { EnquiryRow } from "@/components/commercial";
import {
  CTAButton,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui";
import { fetchMyEnquiries, type EnquirySummary } from "@/data/enquiries";
import { useAuth } from "@/lib/auth";
import { useBasket } from "@/lib/basket";
import { isSupabaseConfigured } from "@/lib/supabase";
import { colors, radius, spacing, type } from "@/theme/tokens";

/** Orders tab (C08). Until orders arrive in Phase 4 it lists enquiries and their quotations. */
export default function OrdersScreen() {
  const { profile } = useAuth();
  const { count } = useBasket();
  const { sent } = useLocalSearchParams<{ sent?: string }>();
  const [list, setList] = useState<EnquirySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    if (!isSupabaseConfigured || !profile) return;
    let cancelled = false;
    fetchMyEnquiries(profile.id)
      .then((l) => {
        if (cancelled) return;
        setList(l);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [profile]);
  useFocusEffect(load);

  if (!isSupabaseConfigured) {
    return (
      <EmptyState
        title="Enquiries and orders"
        hint="Connect the app to the server to send enquiries."
      />
    );
  }
  if (error && !list) return <ErrorState message={error} onRetry={load} />;
  if (!list) return <LoadingState />;
  const sentItem = sent ? list.find((e) => e.id === sent) : undefined;

  return (
    <FlatList
      style={styles.root}
      data={list}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{
        padding: spacing.lg,
        gap: spacing.md,
        flexGrow: 1,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          colors={[colors.brandSecondary]}
        />
      }
      ListHeaderComponent={
        sentItem || count > 0 ? (
          <View style={{ gap: spacing.md }}>
            {sentItem && (
              <View style={styles.sent} accessibilityLiveRegion="polite">
                <Text
                  style={[
                    type.body,
                    { color: colors.success, fontWeight: "700" },
                  ]}
                >
                  Enquiry {sentItem.number} sent
                </Text>
                <Text style={[type.caption, { color: colors.textPrimary }]}>
                  We’ll review it and send your quotation here. To ask about
                  other products, start a new enquiry from the catalogue.
                </Text>
              </View>
            )}
            {count > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/enquiry")}
                style={styles.basket}
              >
                <Text
                  style={[
                    type.body,
                    { color: colors.textOnBrand, fontWeight: "600" },
                  ]}
                >
                  {count} product{count === 1 ? "" : "s"} in your enquiry, not
                  sent yet
                </Text>
                <Text style={[type.body, { color: colors.textOnBrand }]}>
                  Review ›
                </Text>
              </Pressable>
            )}
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        <View style={{ gap: spacing.lg }}>
          <EmptyState
            title="No enquiries yet"
            hint="Add products to an enquiry and send it to get a quotation."
          />
          <CTAButton
            label="Browse catalogue"
            onPress={() => router.navigate("/")}
          />
        </View>
      }
      renderItem={({ item }) => (
        <EnquiryRow item={item} highlight={item.id === sent} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  card: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  sent: {
    backgroundColor: "#E6F4EA",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  basket: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xs,
  },
});
