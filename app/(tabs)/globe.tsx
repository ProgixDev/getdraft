import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
// expo-image, NOT react-native's Image: the built-in one decodes remote
// photos at full resolution (a 2048x1536 upload is 12 MB of bitmap even at
// 320 kB on disk). In a list that is per-row, which overruns the Android
// heap and gets the process killed -- a grey screen ErrorBoundary cannot
// catch, because the crash is native. Glide downsamples to the view size.
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import {
  useFonts,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { theme, semantic } from "@/config/colors";
import { PHONE_MAX_WIDTH } from "@/lib/responsive";
import { statsService } from "@/services/stats";
import { useRoleHomeRedirect } from "@/lib/roleRoutes";
import { discoverService, type MapPoint } from "@/services/discover";
import {
  useRegionSearch,
  type RegionOption,
} from "@/hooks/use-region-search";
import { COUNTRY_OPTIONS, type CountryOption } from "@/constants/countryData";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Same public token the location search uses. Inlined at build time by
// Metro; present in every EAS build. Without it the map can't load, so we
// fall back to a friendly placeholder (see render) instead of a blank tab.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

// ── Continent list (labels + icons only) ──
// Counts come EXCLUSIVELY from the live stats API — no invented figures.
// Until the API answers (or when it has nothing for a continent) the card
// shows a neutral "Growing" label instead.
// lat/lng is where the camera lands when a hotspot row is tapped, and `zoom`
// is per-continent because one value cannot frame both Oceania and Europe.
const CONTINENT_META = [
  {
    name: "North America",
    icon: "american-football" as const,
    lat: 44,
    lng: -100,
    zoom: 2.4,
  },
  { name: "Europe", icon: "football" as const, lat: 52, lng: 12, zoom: 3 },
  { name: "Africa", icon: "fitness" as const, lat: 2, lng: 20, zoom: 2.4 },
  {
    name: "South America",
    icon: "football" as const,
    lat: -18,
    lng: -60,
    zoom: 2.5,
  },
  { name: "Asia", icon: "tennisball" as const, lat: 36, lng: 95, zoom: 2.2 },
  {
    name: "Oceania",
    icon: "basketball" as const,
    lat: -25,
    lng: 140,
    zoom: 2.7,
  },
];

type ContinentRow = {
  name: string;
  icon: (typeof CONTINENT_META)[number]["icon"];
  lat: number;
  lng: number;
  zoom: number;
  athletes: number | null;
  recruiters: number | null;
};

const DEFAULT_CONTINENTS: ContinentRow[] = CONTINENT_META.map((m) => ({
  ...m,
  athletes: null,
  recruiters: null,
}));

// ── Interactive Mapbox globe HTML ──
// A real 3D world map (Mapbox GL, globe projection) with named
// continents / countries / cities and pinch-zoom — the "like Apple Maps"
// experience the client asked for. Role-targeted candidates are plotted
// as tappable dots that bridge a "{type:'point', id}" message back to RN.
// The map never auto-spins: it holds wherever the user leaves it.
function buildGlobeHtml(
  points: { id: string; lat: number; lng: number; role: string; generated: boolean }[],
  token: string,
): string {
  // GeoJSON feature set — only id + generated travel into the WebView;
  // the rest of each candidate stays RN-side for the mini/big card.
  const fc = JSON.stringify({
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, generated: p.generated },
    })),
  });
  // Dot color: brand blue in production. Dev builds tint seeded/demo
  // accounts (@getdraft.app) orange so real signups stand out — end
  // users must never see a two-tone map.
  const DOT = "#38A1F7";
  const colorExpr = __DEV__
    ? `['case',['boolean',['get','generated'],false],'#FDA63A','${DOT}']`
    : `'${DOT}'`;
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link href="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.js"><\/script>
<style>
*{margin:0;padding:0}
html,body,#map{height:100%;width:100%}
body{background:#0a0a0a;overflow:hidden}
.mapboxgl-ctrl-logo{opacity:.35}
.mapboxgl-ctrl-attrib{opacity:.3;font-size:9px}
.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group{margin:0 10px 96px 0}
</style>
</head><body><div id="map"></div>
<script>
mapboxgl.accessToken=${JSON.stringify(token)};
var FC=${fc};
var map=new mapboxgl.Map({
  container:'map',
  style:'mapbox://styles/mapbox/dark-v11',
  projection:'globe',
  center:[-40,25],
  zoom:1.35,
  minZoom:0.6,
  attributionControl:false,
  logoPosition:'bottom-left'
});
// Zoom in/out control (no compass) — bottom-right, above the tab bar.
map.addControl(new mapboxgl.NavigationControl({showCompass:false,visualizePitch:false}),'bottom-right');
// "Back to globe". Mapbox only renders the globe projection when zoomed out;
// pinch in and it becomes an ordinary flat street map, which is what the tab
// looks like after any exploring. The only way back was repeated taps on the
// minus button, so the globe read as broken once you had left it.
var HOME={center:[-40,25],zoom:1.35};
function ResetCtrl(){}
ResetCtrl.prototype.onAdd=function(m){
  this._map=m;
  var wrap=document.createElement('div');
  wrap.className='mapboxgl-ctrl mapboxgl-ctrl-group';
  var b=document.createElement('button');
  b.type='button';
  b.title='Back to globe';
  b.setAttribute('aria-label','Back to globe');
  b.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block;margin:auto"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3.2 9h17.6M3.2 15h17.6"/></svg>';
  b.onclick=function(){m.flyTo({center:HOME.center,zoom:HOME.zoom,duration:1400,essential:true})};
  wrap.appendChild(b);
  this._c=wrap;
  return wrap;
};
ResetCtrl.prototype.onRemove=function(){
  if(this._c&&this._c.parentNode)this._c.parentNode.removeChild(this._c);
  this._map=undefined;
};
map.addControl(new ResetCtrl(),'bottom-right');
map.on('style.load',function(){
  // Space + atmosphere so the globe reads as a 3D planet, not a flat map.
  map.setFog({
    'color':'rgb(12,16,26)',
    'high-color':'rgb(26,54,102)',
    'horizon-blend':0.08,
    'space-color':'rgb(6,7,12)',
    'star-intensity':0.45
  });
});
map.on('load',function(){
  map.addSource('pts',{type:'geojson',data:FC});
  // Soft halo under each dot.
  map.addLayer({id:'pts-glow',type:'circle',source:'pts',paint:{
    'circle-radius':12,'circle-color':'${DOT}','circle-opacity':0.22,'circle-blur':0.8
  }});
  map.addLayer({id:'pts',type:'circle',source:'pts',paint:{
    'circle-radius':6,'circle-color':${colorExpr},
    'circle-stroke-width':2,'circle-stroke-color':'#ffffff'
  }});
  // Tap a dot -> bridge the id back to RN (same protocol as before).
  map.on('click','pts',function(e){
    if(!e.features||!e.features.length)return;
    var id=e.features[0].properties.id;
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'point',id:id}));
    }
  });
  map.on('mouseenter','pts',function(){map.getCanvas().style.cursor='pointer'});
  map.on('mouseleave','pts',function(){map.getCanvas().style.cursor=''});
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
  }
});
// Inbound: fly the camera somewhere. Until now this bridge was one-way --
// the map could report a tapped dot but nothing could move it, so picking a
// place in the filter sheet had nowhere to go.
function handleRnMessage(raw){
  try{
    var m=JSON.parse(raw);
    if(m.type==='resetView'){
      map.flyTo({center:HOME.center,zoom:HOME.zoom,duration:1400,essential:true});
      return;
    }
    if(m.type!=='flyTo')return;
    map.flyTo({center:[m.lng,m.lat],zoom:m.zoom||4.2,duration:1800,essential:true});
  }catch(e){}
}
// Android delivers on document, iOS on window. Both, or it works on one OS.
document.addEventListener('message',function(e){handleRnMessage(e.data)});
window.addEventListener('message',function(e){handleRnMessage(e.data)});
<\/script></body></html>`;
}

function ContinentCard({
  continent,
  index,
  onPress,
}: {
  continent: ContinentRow;
  index: number;
  onPress?: () => void;
}) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-20);

  useFocusEffect(
    useCallback(() => {
      opacity.value = 0;
      translateX.value = -20;
      opacity.value = withDelay(
        300 + index * 120,
        withTiming(1, { duration: 400 }),
      );
      translateX.value = withDelay(
        300 + index * 120,
        withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }),
      );
    }, []),
  );

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  // Live counts only — a continent with no server data reads "Growing"
  // rather than an invented figure.
  const statsLine =
    continent.athletes == null && continent.recruiters == null
      ? "Growing"
      : `${continent.athletes ?? "—"} athlete${continent.athletes === 1 ? "" : "s"} · ${continent.recruiters ?? "—"} recruiter${continent.recruiters === 1 ? "" : "s"}`;

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={onPress ? `Show ${continent.name}` : undefined}
        style={({ pressed }) => [
          styles.continentCard,
          pressed && onPress ? styles.continentCardPressed : null,
        ]}
      >
        <View style={styles.continentIcon}>
          <Ionicons name={continent.icon} size={16} color={semantic.success} />
        </View>
        <View style={styles.continentInfo}>
          <Text style={styles.continentName}>{continent.name}</Text>
          <Text style={styles.continentStats}>{statsLine}</Text>
        </View>
        {onPress && (
          <Ionicons
            name="chevron-forward"
            size={16}
            color="rgba(255,255,255,0.3)"
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function GlobeTab() {
  // Capture the flag rather than discarding it. Android measures <Text> with
  // whatever font is active at layout time, so rendering before the face has
  // loaded sizes containers to the fallback metrics and then paints wider
  // glyphs into them -- that is what clipped "Skip" to "Ski" on the splash
  // screen (SplashExperience). Fonts are bundled and cached across screens,
  // so by this point the flag is normally already true and the gate costs
  // nothing.
  const [fontsLoaded] = useFonts({
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Globe is the map view of the discover feed for everyone who swipes —
  // athletes see recruiters/coaches, recruiters/coaches see athletes (the
  // role split is enforced on the backend). Parents and admins land on
  // their own role's home via useRoleHomeRedirect (focus-based).
  const redirecting = useRoleHomeRedirect(["athlete", "coach", "recruiter"]);

  const insets = useSafeAreaInsets();
  const [isActive, setIsActive] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const webviewRef = useRef<WebView>(null);
  const [CONTINENTS, setContinents] =
    useState<ContinentRow[]>(DEFAULT_CONTINENTS);
  const [points, setPoints] = useState<MapPoint[]>([]);
  // Mini card sits over the globe on point tap; tapping the mini opens
  // the big-card modal with Draft / Pass.
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [bigOpen, setBigOpen] = useState(false);
  // Map WebView renderer died — show the placeholder instead of crashing.
  // Re-focusing the tab gives it another chance (isActive remount cycle).
  const [webviewDead, setWebviewDead] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [matchMsg, setMatchMsg] = useState<string | null>(null);

  // Filter sheet. The sheet was titled "Filters & Hotspots" but offered no
  // filter of any kind — getMapPoints() was called with no arguments, so the
  // globe always showed everyone and there was no way to narrow it.
  const [sheetQuery, setSheetQuery] = useState("");
  const { results: regionResults, searching: regionSearching } =
    useRegionSearch(sheetQuery);
  const [filter, setFilter] = useState<{
    country: string;
    region: string;
    label: string;
  } | null>(null);
  // Where the camera should sit. Kept in state rather than posted once,
  // because changing the filter refetches points, which remounts the WebView
  // (its key includes the point count) and loses anything already sent.
  const [flyTarget, setFlyTarget] = useState<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);

  const flyTo = useCallback((lat: number, lng: number, zoom = 4.2) => {
    setFlyTarget({ lat, lng, zoom });
    webviewRef.current?.postMessage(
      JSON.stringify({ type: "flyTo", lat, lng, zoom }),
    );
  }, []);

  /**
   * A wilaya implies its country, so both go into the filter. Sending the
   * region alone would leave the backend matching a region name across every
   * country that happens to share it.
   */
  const applyRegionFilter = useCallback(
    (r: RegionOption) => {
      setFilter({
        country: r.country,
        region: r.name,
        label: `${r.name}, ${r.country}`,
      });
      setSheetQuery("");
      setShowStats(false);
      if (r.lat !== null && r.lng !== null) flyTo(r.lat, r.lng, 5.5);
    },
    [flyTo],
  );

  const applyCountryFilter = useCallback(
    (c: CountryOption) => {
      setFilter({ country: c.name, region: "", label: c.name });
      setSheetQuery("");
      setShowStats(false);
      flyTo(c.lat, c.lng, 3.6);
    },
    [flyTo],
  );

  // Clearing the filter widens the data back to everyone, so the camera
  // should widen with it rather than staying parked on the place that is no
  // longer being filtered for.
  const clearFilter = useCallback(() => {
    setFilter(null);
    setFlyTarget(null);
    webviewRef.current?.postMessage(JSON.stringify({ type: "resetView" }));
  }, []);

  const countryFilteredList = useMemo(() => {
    const q = sheetQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return COUNTRY_OPTIONS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [sheetQuery]);

  // Fetch globe stats from API. The backend returns an object keyed by
  // continent name ({ "North America": { athletes, recruiters, ... } });
  // only numeric server counts are shown — missing continents stay null
  // and render as "Growing" instead of an invented figure.
  useEffect(() => {
    statsService
      .getGlobeStats()
      .then((data) => {
        if (!data || typeof data !== "object") return;
        setContinents(
          CONTINENT_META.map((meta, i) => {
            const s: any = Array.isArray(data) ? data[i] : data[meta.name];
            return {
              ...meta,
              athletes: typeof s?.athletes === "number" ? s.athletes : null,
              recruiters:
                typeof s?.recruiters === "number" ? s.recruiters : null,
            };
          }),
        );
      })
      .catch(() => {});
  }, []);

  // Refresh the role-targeted map candidates on every focus, mirroring
  // how the home rank chip refreshes. Service has a null-safe → mock
  // fallback so this never hangs the WebView.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      discoverService
        .getMapPoints(
          filter ? { country: filter.country, region: filter.region } : undefined,
        )
        .then((rows) => {
          if (!cancelled) setPoints(rows);
        });
      return () => {
        cancelled = true;
      };
    }, [filter]),
  );

  // Lazy load: only render WebView when tab is focused
  useFocusEffect(
    useCallback(() => {
      setIsActive(true);
      return () => setIsActive(false);
    }, []),
  );

  // Minimal payload the WebView needs to plot + raycast. Re-built on
  // any points change so the WebView remounts with fresh data.
  const globeHtml = useMemo(
    () =>
      buildGlobeHtml(
        points.map((p) => ({
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          role: p.role,
          generated: p.generated,
        })),
        MAPBOX_TOKEN ?? "",
      ),
    [points],
  );

  // Tap-bridge handler: the HTML posts { type:'point', id } when a point
  // is tapped (raycast hit).
  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          id?: string;
        };
        // The map finished loading. Changing the filter refetches points,
        // which remounts the WebView, so restore the camera the user chose
        // rather than snapping back to the default world view.
        if (msg.type === "ready") {
          if (flyTarget) {
            webviewRef.current?.postMessage(
              JSON.stringify({ type: "flyTo", ...flyTarget }),
            );
          }
          return;
        }
        if (msg.type !== "point" || !msg.id) return;
        const hit = points.find((p) => p.id === msg.id);
        if (!hit) return;
        setMatchMsg(null);
        setBigOpen(false);
        setSelected(hit);
      } catch {
        // Malformed payload — ignore.
      }
    },
    [points, flyTarget],
  );

  const dismissAll = useCallback(() => {
    setSelected(null);
    setBigOpen(false);
    setMatchMsg(null);
  }, []);

  const openBigCard = useCallback(() => {
    if (selected) setBigOpen(true);
  }, [selected]);

  const handleSwipe = useCallback(
    async (direction: "draft" | "pass") => {
      if (!selected || swiping) return;
      const targetId = selected.id;
      const targetName = selected.name ?? "this profile";
      setSwiping(true);
      try {
        const res = await discoverService.swipe(targetId, direction);
        // Whatever the outcome, remove the point from the globe so the
        // user can't act on it again without a refresh.
        setPoints((prev) => prev.filter((p) => p.id !== targetId));
        if (direction === "draft" && res.matched) {
          setBigOpen(false);
          setSelected(null);
          setMatchMsg(`Game On! You matched with ${targetName}.`);
        } else {
          dismissAll();
        }
      } catch (err) {
        const status = (err as any)?.response?.status;
        if (status === 429 || status === 403) {
          // Out of Drafts — hide the card, they can't act on it right now.
          dismissAll();
          Alert.alert(
            "Out of Drafts",
            "You're out of Drafts this month — upgrade or come back next month.",
          );
        } else {
          // Network / server hiccup — keep the card open so they can retry.
          Alert.alert(
            "Connection problem",
            "That didn't go through. Check your connection and try again.",
          );
        }
      } finally {
        setSwiping(false);
      }
    },
    [selected, swiping, dismissAll],
  );

  if (redirecting) return null;
  // Same reason as the fontsLoaded capture above.
  if (!fontsLoaded) return null;

  return (
    <View style={styles.container}>
      {/* Globe WebView — lazy loaded */}
      <View style={styles.globeContainer}>
        {isActive && MAPBOX_TOKEN && !webviewDead ? (
          <WebView
            // Re-key on the points fingerprint so a fresh fetch fully
            // remounts the WebView (and the Mapbox map state) instead of
            // relying on source-prop diffing.
            key={`globe-${points.length}-${points[0]?.id ?? "empty"}`}
            ref={webviewRef}
            source={{ html: globeHtml }}
            style={styles.webview}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleWebMessage}
            // CRASH-PROOF: an unhandled Android WebView renderer death kills
            // the whole app. Mapbox GL is exactly the kind of GPU load that
            // can get a weak device's renderer killed — fall back to the
            // placeholder instead of taking the app down.
            onRenderProcessGone={() => setWebviewDead(true)}
          />
        ) : !MAPBOX_TOKEN || webviewDead ? (
          // A spinner used to cover BOTH of these, so a missing token or a
          // dead WebView looked identical to loading — and span forever. In
          // every build shipped so far EXPO_PUBLIC_MAPBOX_TOKEN was absent
          // (it lived only in gitignored .env), which meant this tab was a
          // permanent loading state and nobody could tell it had failed.
          // Distinguish "still loading" from "cannot load".
          <View style={styles.globePlaceholder}>
            <Ionicons
              name="earth-outline"
              size={48}
              color="rgba(255,255,255,0.3)"
            />
            <Text style={styles.globeFallbackTitle}>Map unavailable</Text>
            <Text style={styles.globeFallbackText}>
              The talent map couldn&apos;t load. Everything below still works —
              browse the continent breakdown and hotspots as usual.
            </Text>
          </View>
        ) : (
          <View style={styles.globePlaceholder}>
            <ActivityIndicator size="large" color={semantic.success} />
          </View>
        )}
        {/* Gradient overlay at bottom for readability */}
        <View style={styles.bottomGradient} />
      </View>

      {/* Header */}
      <View style={[styles.header, { top: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Global Network</Text>
        <Text style={styles.headerSubtitle}>Talent distribution worldwide</Text>
      </View>

      {/* Filters & Hotspots — visible pill button opening the bottom sheet.
          The tab bar is NOT absolute (the scene ends above it), so a small
          insets-aware offset from the scene bottom is enough. */}
      <Pressable
        style={({ pressed }) => [
          styles.hotspotsButton,
          { bottom: insets.bottom + 20 },
          pressed && { opacity: 0.85 },
        ]}
        onPress={() => {
          // Dismiss any selected point mini-card before the sheet slides up.
          setSelected(null);
          setShowStats(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Open filters and hotspots"
      >
        <Ionicons name="options-outline" size={16} color="#FFFFFF" />
        <Text style={styles.hotspotsButtonText}>Filters & Hotspots</Text>
      </Pressable>

      {/* Instruction hint — centered above the hotspots button */}
      {!showStats && !selected && !matchMsg && (
        <View style={[styles.hint, { bottom: insets.bottom + 84 }]}>
          <Ionicons
            name="hand-left-outline"
            size={14}
            color="rgba(255,255,255,0.7)"
          />
          <Text style={styles.hintText}>Pinch to zoom · Tap a dot</Text>
        </View>
      )}

      {/* Hotspots bottom sheet */}
      <Modal
        visible={showStats}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowStats(false)}
      >
        {/* The backdrop is a SIBLING behind the sheet, not its parent. As a
            parent Pressable it swallowed the drag gesture on Android, which
            is why the hotspot list could not be scrolled. */}
        <View style={styles.sheetRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowStats(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filters & Hotspots</Text>
              <Pressable
                hitSlop={10}
                onPress={() => setShowStats(false)}
                accessibilityRole="button"
                accessibilityLabel="Close hotspots"
                style={styles.sheetClose}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color="rgba(255,255,255,0.7)"
                />
              </Pressable>
            </View>

            <View style={styles.sheetSearch}>
              <Ionicons name="search" size={16} color="rgba(255,255,255,0.5)" />
              <TextInput
                style={styles.sheetSearchInput}
                placeholder="Search country or wilaya..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={sheetQuery}
                onChangeText={setSheetQuery}
                autoCorrect={false}
                autoCapitalize="words"
              />
              {regionSearching && (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              )}
              {sheetQuery.length > 0 && !regionSearching && (
                <Pressable onPress={() => setSheetQuery("")} hitSlop={10}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color="rgba(255,255,255,0.4)"
                  />
                </Pressable>
              )}
            </View>

            {filter && (
              <View style={styles.activeFilterRow}>
                <Ionicons name="funnel" size={13} color={semantic.success} />
                <Text style={styles.activeFilterText} numberOfLines={1}>
                  {filter.label}
                </Text>
                <Pressable
                  onPress={clearFilter}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear filter"
                >
                  <Ionicons name="close-circle" size={17} color="#fff" />
                </Pressable>
              </View>
            )}

            <ScrollView
              contentContainerStyle={{
                gap: 6,
                paddingBottom: insets.bottom + 16,
              }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {regionResults.length > 0 && (
                <>
                  <Text style={styles.sheetSectionLabel}>
                    Wilayas · states · provinces
                  </Text>
                  {regionResults.map((r) => (
                    <Pressable
                      key={`${r.country}-${r.name}`}
                      onPress={() => applyRegionFilter(r)}
                      style={({ pressed }) => [
                        styles.sheetResultRow,
                        pressed && styles.sheetResultPressed,
                      ]}
                    >
                      <Ionicons
                        name="location-outline"
                        size={16}
                        color={semantic.success}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sheetResultName} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={styles.sheetResultSub} numberOfLines={1}>
                          {r.country}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color="rgba(255,255,255,0.35)"
                      />
                    </Pressable>
                  ))}
                </>
              )}

              {countryFilteredList.length > 0 && (
                <>
                  <Text style={styles.sheetSectionLabel}>Countries</Text>
                  {countryFilteredList.map((c) => (
                    <Pressable
                      key={c.code}
                      onPress={() => applyCountryFilter(c)}
                      style={({ pressed }) => [
                        styles.sheetResultRow,
                        pressed && styles.sheetResultPressed,
                      ]}
                    >
                      <Ionicons
                        name="flag-outline"
                        size={16}
                        color="rgba(255,255,255,0.6)"
                      />
                      <Text style={[styles.sheetResultName, { flex: 1 }]}>
                        {c.name}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color="rgba(255,255,255,0.35)"
                      />
                    </Pressable>
                  ))}
                </>
              )}

              {sheetQuery.trim().length < 2 && (
                <>
                  <Text style={styles.sheetSectionLabel}>Talent Hotspots</Text>
                  {CONTINENTS.map((c, i) => (
                    <ContinentCard
                      key={c.name}
                      continent={c}
                      index={i}
                      onPress={() => {
                        // Hotspot rows looked tappable and did nothing.
                        flyTo(c.lat, c.lng, c.zoom);
                        setShowStats(false);
                      }}
                    />
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Match toast — replaces the mini card after a mutual draft. */}
      {matchMsg && (
        <Pressable
          style={styles.matchToast}
          onPress={() => setMatchMsg(null)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss match"
        >
          <Ionicons name="trophy" size={18} color="#FDA63A" />
          <Text style={styles.matchToastText} numberOfLines={2}>
            {matchMsg}
          </Text>
        </Pressable>
      )}

      {/* Mini card — bottom-center over the globe on point tap. Photo
          first; falls back to athlete_profiles.photos[0] (`photo`) and
          finally to a person glyph for athletes with no media at all. */}
      {selected && !bigOpen && (
        <Pressable
          style={styles.miniCard}
          onPress={openBigCard}
          accessibilityRole="button"
          accessibilityLabel={`Open ${selected.name ?? "athlete"}`}
        >
          <View style={styles.miniAvatar}>
            {selected.avatar_url || selected.photo ? (
              <Image
                source={{ uri: (selected.avatar_url ?? selected.photo)! }}
                style={styles.miniAvatarImg}
              />
            ) : (
              <Ionicons
                name="person"
                size={20}
                color="rgba(255,255,255,0.85)"
              />
            )}
          </View>
          <View style={styles.miniInfo}>
            <View style={styles.miniNameRow}>
              <Text style={styles.miniName} numberOfLines={1}>
                {selected.name ?? "Athlete"}
              </Text>
              {selected.verified && (
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={semantic.success}
                />
              )}
            </View>
            <Text style={styles.miniMeta} numberOfLines={1}>
              {[selected.sport, selected.position]
                .filter(Boolean)
                .join(" · ") || "Athlete"}
            </Text>
          </View>
          <Pressable
            hitSlop={10}
            onPress={dismissAll}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.miniClose}
          >
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </Pressable>
      )}

      {/* Big card — full draft/pass modal with hero image + details. */}
      <Modal
        visible={bigOpen && !!selected}
        transparent
        animationType="fade"
        onRequestClose={dismissAll}
      >
        <Pressable style={styles.bigBackdrop} onPress={dismissAll}>
          {selected && (
            <Pressable style={styles.bigCard} onPress={() => {}}>
              <View style={styles.bigHero}>
                {selected.avatar_url || selected.photo ? (
                  <Image
                    source={{
                      uri: (selected.avatar_url ?? selected.photo)!,
                    }}
                    style={styles.bigHeroImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.bigHeroFallback}>
                    <Ionicons
                      name="person"
                      size={64}
                      color="rgba(255,255,255,0.55)"
                    />
                  </View>
                )}
              </View>

              <View style={styles.bigBody}>
                <View style={styles.bigNameRow}>
                  <Text style={styles.bigName} numberOfLines={1}>
                    {selected.name ?? "Athlete"}
                  </Text>
                  {selected.verified && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={semantic.success}
                    />
                  )}
                </View>

                <View style={styles.bigDetails}>
                  <PlayerDetail label="Sport" value={selected.sport} />
                  <PlayerDetail
                    label="Organization"
                    value={selected.organization}
                  />
                  <PlayerDetail label="Position" value={selected.position} />
                  <PlayerDetail label="Level" value={selected.level} />
                  <PlayerDetail
                    label="Class year"
                    value={selected.class_year}
                  />
                  <PlayerDetail label="Height" value={selected.height} />
                  <PlayerDetail
                    label="GPA"
                    value={
                      selected.gpa != null ? selected.gpa.toFixed(1) : null
                    }
                  />
                </View>

                <View style={styles.bigActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.bigBtn,
                      styles.passBtn,
                      pressed && { opacity: 0.85 },
                      swiping && { opacity: 0.5 },
                    ]}
                    onPress={() => handleSwipe("pass")}
                    disabled={swiping}
                    accessibilityRole="button"
                    accessibilityLabel={`Pass on ${selected.name ?? "athlete"}`}
                  >
                    <Ionicons name="close" size={20} color="#FFFFFF" />
                    <Text style={styles.bigBtnText}>Pass</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.bigBtn,
                      styles.draftBtn,
                      pressed && { opacity: 0.85 },
                      swiping && { opacity: 0.5 },
                    ]}
                    onPress={() => handleSwipe("draft")}
                    disabled={swiping}
                    accessibilityRole="button"
                    accessibilityLabel={`Draft ${selected.name ?? "athlete"}`}
                  >
                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    <Text style={styles.bigBtnText}>Draft</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

// A single label/value row in the big card's details list. Rendered as
// null when value is missing so the list only shows fields the athlete
// actually has — no "Position: —" placeholder noise.
function PlayerDetail({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {String(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  globeContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  globePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  globeFallbackTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 12,
  },
  globeFallbackText: {
    fontSize: 13,
    // Poppins_500Medium, not 400 — this screen only loads 500/600/700/800.
    // Naming an unloaded face is what caused the splash "Ski" truncation.
    fontFamily: "Poppins_500Medium",
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: "transparent",
  },
  header: {
    position: "absolute",
    left: 24,
    right: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Poppins_800ExtraBold",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 2,
  },
  hotspotsButton: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(0, 184, 148, 0.22)",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderWidth: 1.5,
    borderColor: semantic.success,
  },
  hotspotsButtonText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: "#FFFFFF",
  },
  // Holds the dim layer and the sheet as siblings. The dim used to be the
  // sheet's parent Pressable, which ate the scroll gesture on Android.
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  sheetSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  sheetSearchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    // Android centres short text oddly in a fixed-height row without this.
    paddingVertical: 0,
  },
  sheetSectionLabel: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 2,
  },
  sheetResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  sheetResultPressed: {
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  sheetResultName: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: "#fff",
  },
  sheetResultSub: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.45)",
    marginTop: 1,
  },
  activeFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(31,170,89,0.18)",
    borderWidth: 1,
    borderColor: "rgba(31,170,89,0.45)",
  },
  activeFilterText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: "#fff",
  },
  sheet: {
    width: "100%",
    maxWidth: PHONE_MAX_WIDTH,
    alignSelf: "center",
    maxHeight: SCREEN_HEIGHT * 0.55,
    backgroundColor: "#151515",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 16,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginTop: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
    color: "#FFFFFF",
  },
  sheetClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  continentCardPressed: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  continentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  continentIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0, 184, 148, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  continentInfo: {
    flex: 1,
  },
  continentName: {
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
    color: "#FFFFFF",
  },
  continentStats: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255, 255, 255, 0.45)",
    marginTop: 1,
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  hintText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255, 255, 255, 0.7)",
  },
  matchToast: {
    position: "absolute",
    bottom: 170,
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderWidth: 1,
    borderColor: "rgba(253,166,58,0.5)",
  },
  matchToastText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: "#FFFFFF",
  },
  miniCard: {
    position: "absolute",
    bottom: 170,
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(15,18,24,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  miniAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  miniAvatarImg: { width: "100%", height: "100%" },
  miniInfo: { flex: 1 },
  miniNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  miniName: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: "#FFFFFF",
  },
  miniMeta: {
    marginTop: 1,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.6)",
  },
  miniClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bigBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  bigCard: {
    width: "100%",
    maxWidth: 360,
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#15171F",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  bigHero: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  bigHeroImage: { width: "100%", height: "100%" },
  bigHeroFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bigBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
  },
  bigNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bigName: {
    flexShrink: 1,
    fontSize: 22,
    fontFamily: "Poppins_800ExtraBold",
    color: "#FFFFFF",
  },
  bigDetails: {
    marginTop: 14,
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  detailLabel: {
    width: 86,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: "#FFFFFF",
  },
  bigActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
    width: "100%",
  },
  bigBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 28,
  },
  passBtn: { backgroundColor: "#E74C3C" },
  draftBtn: { backgroundColor: semantic.success },
  bigBtnText: {
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
});
