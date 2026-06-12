import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

import { brand, theme } from "@/config/colors";
import { COUNTRY_OPTIONS, type CountryOption } from "@/constants/countryData";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MIN_LEN = 2;

export interface LocationValue {
  label: string;
  latitude: number;
  longitude: number;
}

interface LocationPickerProps {
  value: string | null;
  latitude: number | null;
  longitude: number | null;
  onChange: (value: LocationValue) => void;
}

interface Suggestion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

function buildForwardV6(q: string, country?: string) {
  const params = new URLSearchParams({
    q,
    access_token: MAPBOX_TOKEN ?? "",
    types: "region,place,locality,district",
    autocomplete: "true",
    limit: "6",
    language: "en",
  });
  if (country) params.set("country", country.toLowerCase());
  return `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`;
}

function buildForwardV5(q: string, country?: string) {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN ?? "",
    types: "region,place,locality",
    autocomplete: "true",
    limit: "6",
  });
  if (country) params.set("country", country.toLowerCase());
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    q,
  )}.json?${params.toString()}`;
}

function buildReverseV6(lng: number, lat: number) {
  const params = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    access_token: MAPBOX_TOKEN ?? "",
    types: "place,region,country",
    language: "en",
  });
  return `https://api.mapbox.com/search/geocode/v6/reverse?${params.toString()}`;
}

function buildStaticPreview(lng: number, lat: number) {
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-s+1faa59(${lng},${lat})/${lng},${lat},11,0/600x300@2x?access_token=${MAPBOX_TOKEN ?? ""}`;
}

function featureV6ToSuggestion(f: any, idx: number): Suggestion | null {
  const coords = f?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const label =
    f?.properties?.full_address ??
    f?.properties?.name_preferred ??
    f?.properties?.name ??
    "Unknown";
  return {
    id: String(f?.id ?? `v6-${idx}-${label}`),
    label,
    latitude: lat,
    longitude: lng,
  };
}

function featureV5ToSuggestion(f: any, idx: number): Suggestion | null {
  const coords = f?.center;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const label = f?.place_name ?? f?.text ?? "Unknown";
  return {
    id: String(f?.id ?? `v5-${idx}-${label}`),
    label,
    latitude: lat,
    longitude: lng,
  };
}

function reverseV6ToLabel(json: any): string | null {
  const features = Array.isArray(json?.features) ? json.features : [];
  if (features.length === 0) return null;
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const name =
      f?.properties?.name_preferred ?? f?.properties?.name ?? f?.text;
    if (name && !seen.has(name)) {
      seen.add(name);
      parts.push(name);
      if (parts.length === 3) break;
    }
  }
  if (parts.length === 0) {
    return features[0]?.properties?.full_address ?? null;
  }
  return parts.join(", ");
}

export function LocationPicker({
  value,
  latitude,
  longitude,
  onChange,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [emptyAfterSearch, setEmptyAfterSearch] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [country, setCountry] = useState<CountryOption | null>(null);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const searchSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokenMissing = !MAPBOX_TOKEN;

  const hasCoords =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const fieldText = value && value.trim().length > 0 ? value : "Set your location";
  const fieldIsPlaceholder = !value || value.trim().length === 0;

  useEffect(() => {
    if (!open) return;
    if (tokenMissing) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const q = query.trim();
    if (q.length < SEARCH_MIN_LEN) {
      setSuggestions([]);
      setSearching(false);
      setEmptyAfterSearch(false);
      setSearchError(null);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      runSearch(q);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, country, open, tokenMissing]);

  async function runSearch(q: string) {
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    setEmptyAfterSearch(false);
    try {
      let results: Suggestion[] = [];
      const v6Resp = await fetch(buildForwardV6(q, country?.code));
      if (v6Resp.ok) {
        const json = await v6Resp.json();
        const feats = Array.isArray(json?.features) ? json.features : [];
        results = feats
          .map((f: any, i: number) => featureV6ToSuggestion(f, i))
          .filter((x: Suggestion | null): x is Suggestion => x !== null);
      } else if (v6Resp.status === 404) {
        const v5Resp = await fetch(buildForwardV5(q, country?.code));
        if (v5Resp.ok) {
          const json = await v5Resp.json();
          const feats = Array.isArray(json?.features) ? json.features : [];
          results = feats
            .map((f: any, i: number) => featureV5ToSuggestion(f, i))
            .filter((x: Suggestion | null): x is Suggestion => x !== null);
        } else {
          throw new Error(`Mapbox v5 returned ${v5Resp.status}`);
        }
      } else {
        throw new Error(`Mapbox returned ${v6Resp.status}`);
      }

      if (seq !== searchSeq.current) return;
      setSuggestions(results);
      setEmptyAfterSearch(results.length === 0);
    } catch (err: any) {
      if (seq !== searchSeq.current) return;
      setSearchError(err?.message ?? "Search failed");
      setSuggestions([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }

  async function handleUseCurrentLocation() {
    if (tokenMissing) return;
    setLocateError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocateError(
          "Location permission denied. Enable it in Settings or search manually.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const resp = await fetch(buildReverseV6(lng, lat));
      if (!resp.ok) throw new Error(`Reverse geocode failed (${resp.status})`);
      const json = await resp.json();
      const label = reverseV6ToLabel(json) ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      onChange({ label, latitude: lat, longitude: lng });
      setOpen(false);
    } catch (err: any) {
      setLocateError(err?.message ?? "Could not determine your location.");
    } finally {
      setLocating(false);
    }
  }

  function handleSelectSuggestion(s: Suggestion) {
    onChange({ label: s.label, latitude: s.latitude, longitude: s.longitude });
    setOpen(false);
    setQuery("");
    setSuggestions([]);
  }

  function handleCloseModal() {
    setOpen(false);
    setQuery("");
    setSuggestions([]);
    setSearchError(null);
    setEmptyAfterSearch(false);
    setLocateError(null);
  }

  const staticPreviewUri = useMemo(() => {
    if (!hasCoords || tokenMissing) return null;
    return buildStaticPreview(longitude as number, latitude as number);
  }, [hasCoords, latitude, longitude, tokenMissing]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <View style={styles.fieldIconWrap}>
          <Ionicons name="location-outline" size={18} color={theme.text} />
        </View>
        <View style={styles.fieldContent}>
          <Text style={styles.fieldLabel}>Location</Text>
          <Text
            style={[
              styles.fieldValue,
              fieldIsPlaceholder && styles.fieldValuePlaceholder,
            ]}
            numberOfLines={2}
          >
            {fieldText}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
      </Pressable>

      {staticPreviewUri && (
        <View style={styles.previewWrap}>
          <Image
            source={{ uri: staticPreviewUri }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        </View>
      )}

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={handleCloseModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose location</Text>
              <Pressable
                onPress={handleCloseModal}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>

            {tokenMissing && (
              <View style={styles.warningBox}>
                <Ionicons name="alert-circle" size={16} color="#FDCB6E" />
                <Text style={styles.warningText}>
                  Location search unavailable: missing EXPO_PUBLIC_MAPBOX_TOKEN.
                </Text>
              </View>
            )}

            <Pressable
              onPress={handleUseCurrentLocation}
              disabled={locating || tokenMissing}
              style={({ pressed }) => [
                styles.gpsButton,
                (locating || tokenMissing) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {locating ? (
                <ActivityIndicator size="small" color={brand.white} />
              ) : (
                <Ionicons name="locate" size={18} color={brand.white} />
              )}
              <Text style={styles.gpsButtonText}>
                {locating ? "Locating…" : "Use my current location"}
              </Text>
            </Pressable>

            {locateError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#FF7675" />
                <Text style={styles.errorText}>{locateError}</Text>
              </View>
            )}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or search</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.countryRow}>
              <Pressable
                onPress={() => setCountryModalOpen(true)}
                style={({ pressed }) => [
                  styles.countryChip,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="flag-outline"
                  size={14}
                  color={theme.text}
                />
                <Text style={styles.countryChipText}>
                  {country ? country.name : "Any country"}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color={theme.textMuted}
                />
              </Pressable>
              {country && (
                <Pressable
                  onPress={() => setCountry(null)}
                  style={styles.countryClear}
                >
                  <Text style={styles.countryClearText}>Clear</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.searchWrap}>
              <Ionicons
                name="search"
                size={16}
                color={theme.textMuted}
                style={styles.searchIcon}
              />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search wilaya, city…"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="words"
                editable={!tokenMissing}
              />
              {searching && (
                <ActivityIndicator
                  size="small"
                  color={theme.textMuted}
                  style={styles.searchSpinner}
                />
              )}
            </View>

            {searchError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#FF7675" />
                <Text style={styles.errorText}>{searchError}</Text>
              </View>
            )}

            <ScrollView
              style={styles.suggestionsScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {suggestions.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => handleSelectSuggestion(s)}
                  style={({ pressed }) => [
                    styles.suggestionRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="location"
                    size={16}
                    color={theme.textSecondary}
                  />
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}

              {!searching &&
                !searchError &&
                emptyAfterSearch &&
                query.trim().length >= SEARCH_MIN_LEN && (
                  <Text style={styles.emptyHint}>
                    No matches. Try a different spelling or country.
                  </Text>
                )}

              {!searching &&
                !searchError &&
                query.trim().length < SEARCH_MIN_LEN && (
                  <Text style={styles.emptyHint}>
                    Type at least 2 characters to search.
                  </Text>
                )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={countryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryModalOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setCountryModalOpen(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select country</Text>
              <Pressable
                onPress={() => setCountryModalOpen(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.suggestionsScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {COUNTRY_OPTIONS.map((c) => {
                const selected = country?.code === c.code;
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => {
                      setCountry(c);
                      setCountryModalOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.countryOption,
                      selected && styles.countryOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.countryOptionText,
                        selected && styles.countryOptionTextSelected,
                      ]}
                    >
                      {c.name}
                    </Text>
                    {selected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={theme.accentText}
                      />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.surface,
  },
  fieldIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  fieldContent: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  fieldValue: {
    marginTop: 1,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  fieldValuePlaceholder: {
    color: theme.textMuted,
    fontFamily: "Poppins_400Regular",
  },
  previewWrap: {
    marginTop: 10,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  previewImage: {
    width: "100%",
    height: 140,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalSheet: {
    maxHeight: "85%",
    backgroundColor: theme.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(253,203,110,0.12)",
    borderColor: "rgba(253,203,110,0.6)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "#FDCB6E",
  },
  gpsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: brand.primary,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingVertical: 14,
  },
  gpsButtonText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  disabled: {
    opacity: 0.55,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(231,76,60,0.12)",
    borderColor: "rgba(231,76,60,0.6)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "#FF7675",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border,
  },
  dividerText: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
    letterSpacing: 1,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
  },
  countryChipText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  countryClear: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  countryClearText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBg,
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.inputText,
    fontSize: 14,
  },
  searchSpinner: {
    marginLeft: 6,
  },
  suggestionsScroll: {
    maxHeight: 280,
    marginTop: 4,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  emptyHint: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    textAlign: "center",
    paddingVertical: 12,
  },
  countryOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: theme.surface,
  },
  countryOptionSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.accent,
  },
  countryOptionText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  countryOptionTextSelected: {
    color: theme.accentText,
  },
  pressed: {
    opacity: 0.85,
  },
});

export default LocationPicker;
