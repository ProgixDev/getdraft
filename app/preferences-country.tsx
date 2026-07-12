import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(
    findCountryByName(preferences.country) ?? COUNTRY_OPTIONS[0],
  );

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

  useEffect(() => {
    if (!globeReady || !selectedCountry) return;

    const message = JSON.stringify({
      type: "selectCountry",
      lat: selectedCountry.lat,
      lng: selectedCountry.lng,
    });

    webViewRef.current?.postMessage(message);
  }, [globeReady, selectedCountry]);

  const handleApplyCountry = () => {
    const countryChanged = selectedCountry.name !== preferences.country;
    dispatch(
      setDiscoverPreferences({
        ...preferences,
        country: selectedCountry.name,
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
          Search and select where you want opportunities.
        </Text>

        <View style={styles.globeContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: globeHtml }}
            style={styles.globe}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled
            domStorageEnabled
            onLoadEnd={() => setGlobeReady(true)}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={theme.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search country..."
              placeholderTextColor={theme.inputPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="words"
            />
          </View>

          <ScrollView
            style={styles.results}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {filteredCountries.map((country) => {
              const selected = selectedCountry.name === country.name;
              return (
                <Pressable
                  key={country.code}
                  onPress={() => setSelectedCountry(country)}
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
