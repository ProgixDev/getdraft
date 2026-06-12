import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import * as ExpoLocation from "expo-location";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { brand, neutral } from "@/config/colors";

const { width, height } = Dimensions.get("window");
const GLOBE_HEIGHT = height * 0.4;

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

interface Location {
  name: string;
  city: string;
  country: string;
  state?: string;
  lat: number;
  lng: number;
  formatted: string;
}

interface LocationSelectionScreenProps {
  onLocationSelected: (
    city: string,
    country: string,
    lat: number,
    lng: number,
  ) => void;
  onBack: () => void;
}

export const LocationSelectionScreen: React.FC<
  LocationSelectionScreenProps
> = ({ onLocationSelected, onBack }) => {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Globe collapses (height → 0) when the search input is focused so the
  // card + results + Continue lift above the keyboard. Restored on blur.
  const globeProgress = useSharedValue(1); // 1 = expanded, 0 = collapsed
  const animatedGlobeStyle = useAnimatedStyle(() => ({
    height: GLOBE_HEIGHT * globeProgress.value,
    opacity: globeProgress.value,
    marginBottom: 20 * globeProgress.value,
  }));
  const handleSearchFocus = () => {
    globeProgress.value = withTiming(0, { duration: 220 });
  };
  const handleSearchBlur = () => {
    globeProgress.value = withTiming(1, { duration: 260 });
  };

  // Popular cities as fallback. Country names are FULL ("United States", not "USA") so they match
  // the seeded data and the Discover country filter.
  const popularCities: Location[] = [
    {
      name: "New York",
      city: "New York",
      country: "United States",
      state: "New York",
      lat: 40.7128,
      lng: -74.006,
      formatted: "New York, NY, United States",
    },
    {
      name: "Los Angeles",
      city: "Los Angeles",
      country: "United States",
      state: "California",
      lat: 34.0522,
      lng: -118.2437,
      formatted: "Los Angeles, CA, United States",
    },
    {
      name: "Toronto",
      city: "Toronto",
      country: "Canada",
      state: "Ontario",
      lat: 43.6532,
      lng: -79.3832,
      formatted: "Toronto, ON, Canada",
    },
    {
      name: "Montreal",
      city: "Montreal",
      country: "Canada",
      state: "Quebec",
      lat: 45.5019,
      lng: -73.5674,
      formatted: "Montreal, QC, Canada",
    },
    {
      name: "London",
      city: "London",
      country: "United Kingdom",
      lat: 51.5074,
      lng: -0.1278,
      formatted: "London, United Kingdom",
    },
    {
      name: "Paris",
      city: "Paris",
      country: "France",
      lat: 48.8566,
      lng: 2.3522,
      formatted: "Paris, France",
    },
    {
      name: "Tokyo",
      city: "Tokyo",
      country: "Japan",
      lat: 35.6762,
      lng: 139.6503,
      formatted: "Tokyo, Japan",
    },
    {
      name: "Dubai",
      city: "Dubai",
      country: "United Arab Emirates",
      lat: 25.2048,
      lng: 55.2708,
      formatted: "Dubai, United Arab Emirates",
    },
  ];

  // Mapbox forward geocoding (v6, with v5 fallback on 404). Returns FULL country names like
  // "United States" / "Canada" so the saved user.country matches the Discover filter.
  const searchLocations = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    if (!MAPBOX_TOKEN) {
      console.warn(
        "[LocationSelectionScreen] EXPO_PUBLIC_MAPBOX_TOKEN missing; using popularCities filter.",
      );
      setSearchResults(
        popularCities.filter((c) =>
          c.name.toLowerCase().includes(query.toLowerCase()),
        ),
      );
      return;
    }

    setIsSearching(true);

    try {
      const v6Params = new URLSearchParams({
        q: query,
        access_token: MAPBOX_TOKEN,
        types: "place,locality,region",
        autocomplete: "true",
        limit: "8",
        language: "en",
      });
      const v6Url = `https://api.mapbox.com/search/geocode/v6/forward?${v6Params.toString()}`;
      let resp = await fetch(v6Url);

      let locations: Location[] = [];

      if (resp.ok) {
        const json = await resp.json();
        locations = (json.features || [])
          .map((feature: any): Location | null => {
            const props = feature.properties ?? {};
            const ctx = props.context ?? {};
            const coords = props.coordinates ?? {};
            const lng = Number(
              coords.longitude ?? feature.geometry?.coordinates?.[0],
            );
            const lat = Number(
              coords.latitude ?? feature.geometry?.coordinates?.[1],
            );
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            const country = ctx.country?.name ?? "";
            const state = ctx.region?.name;
            const city = props.name ?? "";
            const formatted =
              props.full_address ?? props.place_formatted ?? city;
            return {
              name: city,
              city,
              country,
              state,
              lat,
              lng,
              formatted,
            };
          })
          .filter((x: Location | null): x is Location => x !== null);
      } else if (resp.status === 404) {
        const v5Params = new URLSearchParams({
          access_token: MAPBOX_TOKEN,
          types: "place,locality,region",
          autocomplete: "true",
          limit: "8",
          language: "en",
        });
        const v5Url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          query,
        )}.json?${v5Params.toString()}`;
        resp = await fetch(v5Url);
        if (!resp.ok) throw new Error(`Mapbox v5 returned ${resp.status}`);
        const json = await resp.json();
        locations = (json.features || [])
          .map((feature: any): Location | null => {
            const center = feature.center;
            if (!Array.isArray(center) || center.length < 2) return null;
            const lng = Number(center[0]);
            const lat = Number(center[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            const city = feature.text ?? "";
            const formatted = feature.place_name ?? city;
            const ctxArr: any[] = Array.isArray(feature.context)
              ? feature.context
              : [];
            const countryEntry = ctxArr.find((c) =>
              typeof c?.id === "string" && c.id.startsWith("country"),
            );
            const stateEntry = ctxArr.find((c) =>
              typeof c?.id === "string" && c.id.startsWith("region"),
            );
            return {
              name: city,
              city,
              country: countryEntry?.text ?? "",
              state: stateEntry?.text,
              lat,
              lng,
              formatted,
            };
          })
          .filter((x: Location | null): x is Location => x !== null);
      } else {
        throw new Error(`Mapbox v6 returned ${resp.status}`);
      }

      setSearchResults(locations);
    } catch (error) {
      console.error("Error searching locations:", error);
      // Fallback to popular cities on error
      setSearchResults(
        popularCities.filter((city) =>
          city.name.toLowerCase().includes(query.toLowerCase()),
        ),
      );
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(() => {
      searchLocations(searchQuery);
    }, 300);

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [searchQuery]);

  const handleLocationSelect = (location: Location) => {
    setSelectedLocation(location);

    // Send location to WebView globe
    if (webViewRef.current) {
      const message = JSON.stringify({
        type: "selectLocation",
        lat: location.lat,
        lng: location.lng,
      });
      webViewRef.current.postMessage(message);
    }
  };

  // "Use my current location" — wraps expo-location's foreground permission
  // + GPS fix + reverse geocode. Every failure path keeps the search field
  // working: we surface a small inline note ("Couldn't get your location —
  // search below instead"), never an Alert, never a blocking error.
  const handleUseMyLocation = async () => {
    if (gpsLoading) return;
    setGpsError(null);
    setGpsLoading(true);
    try {
      const perm = await ExpoLocation.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setGpsError("Couldn't get your location — search below instead.");
        return;
      }
      const pos = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      const places = await ExpoLocation.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      const place = places[0];
      // Reverse geocode can be sparse (rural / offline cache). Fall back to
      // subregion / region so we always have SOMETHING to show.
      const city =
        place?.city ?? place?.subregion ?? place?.region ?? "Current location";
      const country = place?.country ?? "";
      const state = place?.region ?? undefined;
      const formatted = [city, state, country].filter(Boolean).join(", ");
      const loc: Location = {
        name: city,
        city,
        country,
        state,
        lat: latitude,
        lng: longitude,
        formatted,
      };
      handleLocationSelect(loc);
    } catch {
      setGpsError("Couldn't get your location — search below instead.");
    } finally {
      setGpsLoading(false);
    }
  };

  const handleContinue = () => {
    if (selectedLocation) {
      onLocationSelected(
        selectedLocation.city,
        selectedLocation.country,
        selectedLocation.lat,
        selectedLocation.lng,
      );
    }
  };

  const displayedLocations = searchQuery ? searchResults : popularCities;

  if (!fontsLoaded) return null;

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
            background: linear-gradient(135deg, #013369 0%, #0a4d8f 50%, #013369 100%);
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
        scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 3, 5);
        scene.add(directionalLight);

        const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 280;

        let autoRotate = true;
        let targetRotY = 0;
        let targetRotX = 0;

        window.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'selectLocation') {
                    autoRotate = false;
                    targetRotY = -data.lng * Math.PI / 180;
                    targetRotX = (data.lat - 20) * Math.PI / 180;
                    
                    Globe.htmlElementsData([{
                        lat: data.lat,
                        lng: data.lng,
                    }])
                    .htmlElement(() => {
                        const el = document.createElement('div');
                        el.innerHTML = '📍';
                        el.style.fontSize = '28px';
                        el.style.textAlign = 'center';
                        return el;
                    });
                }
            } catch (e) {}
        });

        function animate() {
            if (autoRotate) {
                Globe.rotation.y += 0.003;
            } else {
                Globe.rotation.y += (targetRotY - Globe.rotation.y) * 0.05;
                Globe.rotation.x += (targetRotX - Globe.rotation.x) * 0.05;
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

  return (
    <LinearGradient
      colors={[brand.primary, "#0a4d8f", brand.primary]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          {/* Back Button */}
          <Pressable onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={brand.white} />
          </Pressable>

          {/* Header */}
          <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
            <Text style={styles.title}>Where Are You?</Text>
            <Text style={styles.subtitle}>Use GPS or search for your city</Text>
          </Animated.View>

          {/* 3D Globe — collapses to 0 height when the search input is
              focused so the card lifts above the keyboard. The entering
              layout animation goes on the OUTER wrapper, the
              useAnimatedStyle (which also drives opacity) goes on the
              INNER view — putting both on the same Animated.View made
              Reanimated 4 warn that the layout animation could overwrite
              the focus-driven opacity, which on new-arch can crash on
              later unmount. */}
          <Animated.View entering={FadeInDown.duration(1000).delay(200)}>
            <Animated.View
              style={[styles.globeContainer, animatedGlobeStyle]}
            >
              <WebView
                ref={webViewRef}
                source={{ html: globeHtml }}
                style={styles.globe}
                scrollEnabled={false}
                bounces={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
              />
            </Animated.View>
          </Animated.View>

          {/* Search & Results card */}
          <Animated.View
            entering={FadeInDown.duration(800).delay(400)}
            style={styles.card}
          >
            {/* "Use my current location" — the new primary action. Sits
                above the search field so the eye lands on it first. */}
            <Pressable
              style={({ pressed }) => [
                styles.gpsButton,
                pressed && { opacity: 0.9 },
                gpsLoading && { opacity: 0.7 },
              ]}
              onPress={handleUseMyLocation}
              disabled={gpsLoading}
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
            >
              {gpsLoading ? (
                <ActivityIndicator color={brand.white} />
              ) : (
                <>
                  <Ionicons name="navigate" size={18} color={brand.white} />
                  <Text style={styles.gpsButtonText}>
                    Use my current location
                  </Text>
                </>
              )}
            </Pressable>

            {gpsError ? (
              <View style={styles.gpsErrorRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={neutral.gray600}
                />
                <Text style={styles.gpsErrorText}>{gpsError}</Text>
              </View>
            ) : null}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>or search</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={neutral.gray400} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search any city..."
                placeholderTextColor={neutral.gray400}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                autoCorrect={false}
                returnKeyType="search"
              />
              {isSearching && (
                <ActivityIndicator size="small" color={brand.primary} />
              )}
            </View>

            {/* Results */}
            <Text style={styles.sectionTitle}>
              {searchQuery ? "Search Results" : "Popular Cities"}
            </Text>

            <ScrollView
              style={styles.resultsScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.resultsGrid}>
                {displayedLocations.map((location, index) => (
                  <Pressable
                    key={index}
                    style={[
                      styles.locationCard,
                      selectedLocation?.formatted === location.formatted &&
                        styles.locationCardSelected,
                    ]}
                    onPress={() => handleLocationSelect(location)}
                  >
                    <Ionicons
                      name="location"
                      size={20}
                      color={
                        selectedLocation?.formatted === location.formatted
                          ? brand.white
                          : brand.primary
                      }
                    />
                    <View style={styles.locationInfo}>
                      <Text
                        style={[
                          styles.locationName,
                          selectedLocation?.formatted === location.formatted &&
                            styles.locationNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {location.city}
                      </Text>
                      <Text
                        style={[
                          styles.locationCountry,
                          selectedLocation?.formatted === location.formatted &&
                            styles.locationCountrySelected,
                        ]}
                        numberOfLines={1}
                      >
                        {location.state ? `${location.state}, ` : ""}
                        {location.country}
                      </Text>
                    </View>
                    {selectedLocation?.formatted === location.formatted && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={brand.white}
                      />
                    )}
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Continue Button */}
            {selectedLocation && (
              <Pressable
                style={({ pressed }) => [
                  styles.continueButton,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
                onPress={handleContinue}
              >
                <LinearGradient
                  colors={[brand.primary, "#0a4d8f"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>
                    Continue with {selectedLocation.city}
                  </Text>
                  <Ionicons name="arrow-forward" size={20} color={brand.white} />
                </LinearGradient>
              </Pressable>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: 60,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 24,
    marginBottom: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
  },
  globeContainer: {
    height: GLOBE_HEIGHT,
    marginBottom: 20,
    overflow: "hidden",
  },
  globe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  card: {
    flex: 1,
    backgroundColor: brand.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 20,
  },
  gpsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: brand.primary,
    borderRadius: 12,
    height: 50,
    marginBottom: 10,
  },
  gpsButtonText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.2,
  },
  gpsErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  gpsErrorText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
    flex: 1,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: neutral.gray200,
  },
  dividerLabel: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: neutral.gray500,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: neutral.gray50,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: neutral.gray200,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: brand.primary,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: brand.primary,
    marginBottom: 12,
  },
  resultsScroll: {
    maxHeight: 200,
    marginBottom: 16,
  },
  resultsGrid: {
    gap: 10,
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: neutral.gray50,
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: "transparent",
    gap: 12,
  },
  locationCardSelected: {
    backgroundColor: brand.primary,
    borderColor: brand.primary,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: brand.primary,
  },
  locationNameSelected: {
    color: brand.white,
  },
  locationCountry: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
    marginTop: 2,
  },
  locationCountrySelected: {
    color: "rgba(255, 255, 255, 0.9)",
  },
  continueButton: {
    height: 54,
    borderRadius: 12,
    overflow: "hidden",
  },
  buttonGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: {
    color: brand.white,
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
});
