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
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
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
import { brand, neutral } from "@/config/colors";
import axios from "axios";

const { width, height } = Dimensions.get("window");
const GLOBE_HEIGHT = height * 0.4;

// Geoapify API (free tier - 3000 requests/day)
const GEOAPIFY_API_KEY = "51b09ca65d074edcb755c57e9ab69937"; // Get free key at https://www.geoapify.com/

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
  onLocationSelected: (city: string, country: string) => void;
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
  const webViewRef = useRef<WebView>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Popular cities as fallback
  const popularCities: Location[] = [
    {
      name: "New York",
      city: "New York",
      country: "USA",
      lat: 40.7128,
      lng: -74.006,
      formatted: "New York, NY, USA",
    },
    {
      name: "Los Angeles",
      city: "Los Angeles",
      country: "USA",
      lat: 34.0522,
      lng: -118.2437,
      formatted: "Los Angeles, CA, USA",
    },
    {
      name: "London",
      city: "London",
      country: "UK",
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
      country: "UAE",
      lat: 25.2048,
      lng: 55.2708,
      formatted: "Dubai, UAE",
    },
  ];

  // Search locations using Geoapify API
  const searchLocations = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    try {
      // Using Geoapify Autocomplete API (free tier)
      const response = await axios.get(
        `https://api.geoapify.com/v1/geocode/autocomplete`,
        {
          params: {
            text: query,
            type: "city",
            limit: 8,
            apiKey: GEOAPIFY_API_KEY,
          },
        },
      );

      const locations: Location[] = response.data.features.map(
        (feature: any) => {
          const props = feature.properties;
          return {
            name: props.city || props.name,
            city: props.city || props.name,
            country: props.country,
            state: props.state,
            lat: props.lat,
            lng: props.lon,
            formatted: props.formatted,
          };
        },
      );

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

  const handleContinue = () => {
    if (selectedLocation) {
      onLocationSelected(selectedLocation.city, selectedLocation.country);
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
      <View style={styles.content}>
        {/* Back Button */}
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={brand.white} />
        </Pressable>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
          <Text style={styles.title}>Where Are You?</Text>
          <Text style={styles.subtitle}>Search for your city worldwide</Text>
        </Animated.View>

        {/* 3D Globe */}
        <Animated.View
          entering={FadeInDown.duration(1000).delay(200)}
          style={styles.globeContainer}
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

        {/* Search & Results */}
        <Animated.View
          entering={FadeInDown.duration(800).delay(400)}
          style={styles.card}
        >
          {/* Search Input */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={neutral.gray400} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search any city..."
              placeholderTextColor={neutral.gray400}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
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
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: neutral.gray50,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 20,
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
