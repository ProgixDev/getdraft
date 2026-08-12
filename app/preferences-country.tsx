import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { brand, neutral, theme } from "@/config/colors";
import {
  COUNTRY_OPTIONS,
  CountryOption,
  findCountryByName,
} from "@/constants/countryData";
import { RootState } from "@/store";
import { setDiscoverPreferences } from "@/store/slices/discoverPreferencesSlice";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const REGION_SEARCH_DEBOUNCE_MS = 350;
const REGION_SEARCH_MIN_LEN = 2;

/** A first-level division: wilaya, state, province, région. */
interface RegionOption {
  name: string;
  country: string;
  lat: number | null;
  lng: number | null;
}

const globeHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: radial-gradient(circle at 30% 20%, #16385f 0%, #0d223e 48%, #07111f 100%);
      touch-action: none;
    }
    #globe { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="globe"></div>
  <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
  <script src="https://unpkg.com/three-globe@2.45.0/dist/three-globe.min.js"></script>
  <script>
    const Globe = new ThreeGlobe()
      .globeImageUrl('https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png');

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('globe').appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(Globe);
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(6, 3, 5);
    scene.add(directionalLight);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 280;

    let autoRotate = true;
    let targetRotY = 0;
    let targetRotX = 0;

    const handleMessage = (raw) => {
      try {
        const data = JSON.parse(raw);
        if (data.type === 'selectCountry') {
          autoRotate = false;
          targetRotY = -data.lng * Math.PI / 180;
          targetRotX = (data.lat - 15) * Math.PI / 180;

          Globe.htmlElementsData([{ lat: data.lat, lng: data.lng }])
            .htmlElement(() => {
              const el = document.createElement('div');
              el.innerHTML = '📍';
              el.style.fontSize = '30px';
              return el;
            });
        }
      } catch (e) {}
    };

    window.addEventListener('message', (event) => handleMessage(event.data));
    document.addEventListener('message', (event) => handleMessage(event.data));

    function animate() {
      if (autoRotate) {
        Globe.rotation.y += 0.0025;
      } else {
        Globe.rotation.y += (targetRotY - Globe.rotation.y) * 0.06;
        Globe.rotation.x += (targetRotX - Globe.rotation.x) * 0.06;
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;

export default function PreferencesCountryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useDispatch();
  const preferences = useSelector(
    (state: RootState) => state.discoverPreferences,
  );
  const webViewRef = useRef<WebView | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [globeReady, setGlobeReady] = useState(false);
  // Globe WebView died (renderer gone / load error) — drop it, keep the list.
  const [globeDead, setGlobeDead] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(
    findCountryByName(preferences.country) ?? COUNTRY_OPTIONS[0],
  );
  // "" means no region filter — the whole country. Persisted preferences from
  // before this screen learned about regions have no `region` key at all.
  const [selectedRegion, setSelectedRegion] = useState<string>(
    preferences.region ?? "",
  );
  // Only for aiming the globe. Not persisted: the filter itself is the
  // region name, and a stale centroid should never outlive the selection.
  const [selectedRegionCoords, setSelectedRegionCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [regionResults, setRegionResults] = useState<RegionOption[]>([]);
  const [regionSearching, setRegionSearching] = useState(false);
  const regionSearchSeq = useRef(0);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const filteredCountries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return COUNTRY_OPTIONS;

    return COUNTRY_OPTIONS.filter(
      (country) =>
        country.name.toLowerCase().includes(query) ||
        country.code.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  // Regions come from Mapbox rather than a bundled list. There are ~3,000
  // first-level divisions worldwide and they get renamed and resplit (Algeria
  // went from 48 wilayas to 58 in 2019), so shipping them as a constant means
  // shipping something already out of date. Countries stay local because the
  // list is small, stable, and has to work with no network.
  useEffect(() => {
    const q = searchQuery.trim();

    if (!MAPBOX_TOKEN || q.length < REGION_SEARCH_MIN_LEN) {
      setRegionResults([]);
      setRegionSearching(false);
      return;
    }

    setRegionSearching(true);
    const seq = ++regionSearchSeq.current;
    const timer = setTimeout(() => {
      void searchRegions(q, seq);
    }, REGION_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  async function searchRegions(q: string, seq: number) {
    try {
      const params = new URLSearchParams({
        q,
        access_token: MAPBOX_TOKEN as string,
        // `region` is Mapbox's name for the first-level division: wilaya in
        // Algeria, state in the US, province in Canada, région in France.
        types: "region",
        autocomplete: "true",
        limit: "8",
        language: "en",
      });
      const resp = await fetch(
        `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`,
      );
      if (!resp.ok) throw new Error(`geocode ${resp.status}`);
      const json = await resp.json();

      const results: RegionOption[] = (json.features ?? [])
        .map((feature: any): RegionOption | null => {
          const props = feature.properties ?? {};
          const name = props.name;
          // The parent country is what makes a region filterable — "Blida"
          // alone cannot be resolved, and the row would read ambiguously.
          const country = props.context?.country?.name;
          if (!name || !country) return null;
          const coords = props.coordinates ?? {};
          const lat = Number(
            coords.latitude ?? feature.geometry?.coordinates?.[1],
          );
          const lng = Number(
            coords.longitude ?? feature.geometry?.coordinates?.[0],
          );
          return {
            name,
            country,
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
          };
        })
        .filter((r: RegionOption | null): r is RegionOption => r !== null);

      // A slower earlier request must not overwrite a newer one's results.
      if (seq !== regionSearchSeq.current) return;
      setRegionResults(results);
    } catch {
      // Countries still filter fine without this — degrade quietly rather
      // than putting a network error in front of someone picking a filter.
      if (seq === regionSearchSeq.current) setRegionResults([]);
    } finally {
      if (seq === regionSearchSeq.current) setRegionSearching(false);
    }
  }

  // One writer for the globe camera. Selecting a wilaya also sets its country,
  // so if this effect only watched `selectedCountry` it would fire on that
  // change and yank the camera back to the country centroid — the region
  // coordinates have to be part of the same decision, not a separate post.
  useEffect(() => {
    if (!globeReady || !selectedCountry) return;

    const target =
      selectedRegionCoords ?? { lat: selectedCountry.lat, lng: selectedCountry.lng };

    webViewRef.current?.postMessage(
      JSON.stringify({
        type: "selectCountry",
        lat: target.lat,
        lng: target.lng,
      }),
    );
  }, [globeReady, selectedCountry, selectedRegionCoords]);

  /** Picking a country clears any wilaya — the region belonged to the old one. */
  const handleSelectCountry = (country: CountryOption) => {
    setSelectedCountry(country);
    setSelectedRegion("");
    setSelectedRegionCoords(null);
  };

  /**
   * Picking a wilaya implies its country, so both are set at once. Without
   * this the filter would read "Algeria off, Blida on" and match nobody.
   */
  const handleSelectRegion = (region: RegionOption) => {
    const country = findCountryByName(region.country);
    if (country) setSelectedCountry(country);
    setSelectedRegion(region.name);
    setSelectedRegionCoords(
      region.lat !== null && region.lng !== null
        ? { lat: region.lat, lng: region.lng }
        : null,
    );
  };

  const handleClearRegion = () => {
    setSelectedRegion("");
    setSelectedRegionCoords(null);
  };

  const handleApplyCountry = () => {
    const countryChanged = selectedCountry.name !== preferences.country;
    dispatch(
      setDiscoverPreferences({
        ...preferences,
        country: selectedCountry.name,
        region: selectedRegion,
        // Reset city when country changes so stale selections don't persist
        city: countryChanged ? "" : preferences.city,
      }),
    );
    router.back();
  };

  if (!fontsLoaded) return null;

  return (
    <LinearGradient
      colors={["#0A1830", "#10294A", "#0A1830"]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.content, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color={brand.white} />
          </Pressable>
          <Text style={styles.title}>Choose Country</Text>
          <View style={styles.backButton} />
        </View>

        <Text style={styles.subtitle}>
          Search and select where you want to find opportunities.
        </Text>

        <View style={styles.globeContainer}>
          {/* CRASH-PROOF: an unhandled Android WebView renderer death kills
              the whole app (see SplashExperience). Decorative globe — drop it
              on failure, the country list keeps working. */}
          {!globeDead && (
            <WebView
              ref={webViewRef}
              source={{ html: globeHtml }}
              style={styles.globe}
              scrollEnabled={false}
              bounces={false}
              javaScriptEnabled
              domStorageEnabled
              onLoadEnd={() => setGlobeReady(true)}
              onRenderProcessGone={() => setGlobeDead(true)}
              onError={() => setGlobeDead(true)}
            />
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={theme.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search country or wilaya..."
              placeholderTextColor={theme.inputPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="words"
            />
            {regionSearching && (
              <ActivityIndicator size="small" color={theme.textMuted} />
            )}
          </View>

          {selectedRegion !== "" && (
            <View style={styles.activeRegionRow}>
              <Ionicons name="location" size={14} color={brand.white} />
              <Text style={styles.activeRegionText} numberOfLines={1}>
                {selectedRegion}, {selectedCountry.name}
              </Text>
              <Pressable
                onPress={handleClearRegion}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear wilaya filter"
              >
                <Ionicons name="close-circle" size={18} color={brand.white} />
              </Pressable>
            </View>
          )}

          <ScrollView
            style={styles.results}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {regionResults.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>
                  Wilayas · states · provinces
                </Text>
                {regionResults.map((region) => {
                  const selected =
                    selectedRegion === region.name &&
                    selectedCountry.name === region.country;
                  return (
                    <Pressable
                      key={`${region.country}-${region.name}`}
                      onPress={() => handleSelectRegion(region)}
                      style={({ pressed }) => [
                        styles.countryRow,
                        selected && styles.countryRowSelected,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View style={styles.countryLeft}>
                        <View
                          style={[
                            styles.countryCodeBadge,
                            selected && styles.countryCodeBadgeSelected,
                          ]}
                        >
                          <Ionicons
                            name="location-outline"
                            size={14}
                            color={selected ? brand.white : theme.textMuted}
                          />
                        </View>
                        <View style={styles.regionTextBlock}>
                          <Text
                            style={[
                              styles.countryName,
                              selected && styles.countryNameSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {region.name}
                          </Text>
                          <Text style={styles.regionCountry} numberOfLines={1}>
                            {region.country}
                          </Text>
                        </View>
                      </View>
                      {selected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={brand.white}
                        />
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.textMuted}
                        />
                      )}
                    </Pressable>
                  );
                })}
                <Text style={styles.sectionLabel}>Countries</Text>
              </>
            )}

            {filteredCountries.map((country) => {
              const selected =
                selectedCountry.name === country.name && selectedRegion === "";
              return (
                <Pressable
                  key={country.code}
                  onPress={() => handleSelectCountry(country)}
                  style={({ pressed }) => [
                    styles.countryRow,
                    selected && styles.countryRowSelected,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.countryLeft}>
                    <View
                      style={[
                        styles.countryCodeBadge,
                        selected && styles.countryCodeBadgeSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.countryCode,
                          selected && styles.countryCodeSelected,
                        ]}
                      >
                        {country.code}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.countryName,
                        selected && styles.countryNameSelected,
                      ]}
                    >
                      {country.name}
                    </Text>
                  </View>
                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={brand.white}
                    />
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.textMuted}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={handleApplyCountry}
            style={({ pressed }) => [
              styles.applyButton,
              pressed && styles.rowPressed,
            ]}
          >
            <Text style={styles.applyButtonText}>
              Use {selectedCountry.name}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={theme.accentText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  title: {
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 12,
    paddingHorizontal: 24,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.9)",
  },
  globeContainer: {
    height: "34%",
    marginBottom: 10,
  },
  globe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  card: {
    flex: 1,
    backgroundColor: theme.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  searchContainer: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBg,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.inputText,
  },
  results: {
    marginTop: 12,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    marginBottom: 8,
  },
  countryRowSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.surfaceElevated,
  },
  countryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  countryCodeBadge: {
    minWidth: 38,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countryCodeBadgeSelected: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderColor: "rgba(255,255,255,0.35)",
  },
  countryCode: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textSecondary,
  },
  countryCodeSelected: {
    color: brand.white,
  },
  countryName: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  countryNameSelected: {
    color: brand.white,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  // A region row carries two lines (wilaya over its country), so it needs to
  // shrink rather than push the chevron off the row on a narrow screen.
  regionTextBlock: {
    flexShrink: 1,
  },
  regionCountry: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    marginTop: 1,
  },
  activeRegionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(31,170,89,0.18)",
    borderWidth: 1,
    borderColor: "rgba(31,170,89,0.45)",
  },
  activeRegionText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: brand.white,
  },
  footer: {
    backgroundColor: theme.bg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  applyButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  applyButtonText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  rowPressed: {
    opacity: 0.85,
  },
});
