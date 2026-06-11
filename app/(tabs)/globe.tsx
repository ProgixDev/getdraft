import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from "react-native";
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
import { theme } from "@/config/colors";
import { statsService } from "@/services/stats";
import { useRoleHomeRedirect } from "@/lib/roleRoutes";
import { discoverService, type MapPoint } from "@/services/discover";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ── Continent talent data (defaults) ──
const DEFAULT_CONTINENTS = [
  {
    name: "North America",
    athletes: "4,200+",
    recruiters: "180+",
    icon: "american-football" as const,
  },
  {
    name: "Europe",
    athletes: "2,800+",
    recruiters: "150+",
    icon: "football" as const,
  },
  {
    name: "Africa",
    athletes: "1,500+",
    recruiters: "60+",
    icon: "fitness" as const,
  },
  {
    name: "South America",
    athletes: "900+",
    recruiters: "45+",
    icon: "football" as const,
  },
  {
    name: "Asia",
    athletes: "400+",
    recruiters: "35+",
    icon: "tennisball" as const,
  },
  {
    name: "Oceania",
    athletes: "200+",
    recruiters: "30+",
    icon: "basketball" as const,
  },
];

// ── Interactive Three.js globe HTML ──
// Renders the real, role-targeted candidates as point meshes that the
// user can TAP to bridge a "{type:'point', id}" message back to RN.
// Drag still rotates the globe — taps are discriminated by elapsed
// time + total movement on touchend.
function buildGlobeHtml(points: { id: string; lat: number; lng: number; role: string }[]): string {
  // The points payload must be safe to embed inline. JSON.stringify
  // gives us a JS literal that can't break out of the script tag and
  // is bounded by what the backend returns (no untrusted markup).
  const ptsJson = JSON.stringify(points);
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0}
body{overflow:hidden;background:transparent;touch-action:none}
#g{width:100vw;height:100vh}
</style>
</head><body><div id="g"></div>
<script src="https://unpkg.com/three@0.160.0/build/three.min.js"><\/script>
<script src="https://unpkg.com/three-globe@2.45.0/dist/three-globe.min.js"><\/script>
<script>
var PTS=${ptsJson};
// Decorative arcs — static feel of a network. Not tied to any data.
var arcs=[
{startLat:39.8,startLng:-98.6,endLat:51.2,endLng:10.5},
{startLat:39.8,startLng:-98.6,endLat:-14.2,endLng:-51.9},
{startLat:55.4,startLng:-3.4,endLat:36.2,endLng:138.3},
{startLat:56.1,startLng:-106.3,endLat:-25.3,endLng:133.8},
{startLat:46.2,startLng:2.2,endLat:9.1,endLng:8.7},
{startLat:20.6,startLng:79,endLat:35.9,endLng:127.8},
{startLat:-30.6,startLng:22.9,endLat:40.5,endLng:-3.7},
{startLat:23.6,startLng:-102.6,endLat:56.1,endLng:-106.3}
];
// Visible point markers (athletes green, recruiters/coaches orange).
function colorFor(d){return d.role==='athlete'?'#00B894':'#FDA63A'}
var G=new ThreeGlobe()
.globeImageUrl('https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg')
.bumpImageUrl('https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png')
.arcsData(arcs).arcColor(function(){return['rgba(0,184,148,0.6)','rgba(116,185,255,0.6)']})
.arcStroke(0.5).arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(2500)
.pointsData(PTS).pointColor(colorFor).pointAltitude(0.012).pointRadius(0.55);
var r=new THREE.WebGLRenderer({alpha:true,antialias:true});
r.setPixelRatio(Math.min(window.devicePixelRatio,2));
r.setSize(window.innerWidth,window.innerHeight);
document.getElementById('g').appendChild(r.domElement);
var s=new THREE.Scene();s.add(G);
s.add(new THREE.AmbientLight(0xffffff,1.2));
var dl=new THREE.DirectionalLight(0xffffff,0.8);dl.position.set(6,3,5);s.add(dl);
// Soft atmosphere shell.
var ag=new THREE.SphereGeometry(101,32,32);
var am=new THREE.MeshBasicMaterial({color:0x4488ff,transparent:true,opacity:0.08,side:THREE.BackSide});
s.add(new THREE.Mesh(ag,am));
var c=new THREE.PerspectiveCamera(50,window.innerWidth/window.innerHeight,0.1,1000);
c.position.z=260;

// Invisible click targets — three-globe's own point meshes are not
// easy to raycast against directly, so we add sibling spheres at the
// same lat/lng and parent them to the globe so they rotate together.
// G.getCoords() is the public projection three-globe uses for its own
// .pointsData markers, so the targets line up exactly with the dots.
// Slightly larger than the visible dot so tapping is forgiving.
var targets=[];
var targetGeom=new THREE.SphereGeometry(2.2,8,8);
var targetMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0});
for(var i=0;i<PTS.length;i++){
  var p=PTS[i];
  var m=new THREE.Mesh(targetGeom,targetMat);
  var v=G.getCoords(p.lat,p.lng,0.015); // matches pointAltitude(0.012)
  m.position.set(v.x,v.y,v.z);
  m.userData={id:p.id};
  G.add(m);
  targets.push(m);
}

// Touch handling — drag rotates, tap raycasts.
var autoRotate=true;var isDragging=false;
var prevX=0;var prevY=0;var startX=0;var startY=0;var startT=0;var totalMove=0;
var rotX=0;var rotY=0;
var raycaster=new THREE.Raycaster();
function handleTap(x,y){
  var ndc=new THREE.Vector2(
    (x/window.innerWidth)*2-1,
    -(y/window.innerHeight)*2+1
  );
  raycaster.setFromCamera(ndc,c);
  var hits=raycaster.intersectObjects(targets,false);
  if(hits.length>0){
    var id=hits[0].object.userData.id;
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'point',id:id}));
    }
  }
}
document.addEventListener('touchstart',function(e){
  isDragging=true;autoRotate=false;
  prevX=e.touches[0].clientX;prevY=e.touches[0].clientY;
  startX=prevX;startY=prevY;startT=Date.now();totalMove=0;
});
document.addEventListener('touchmove',function(e){
  if(!isDragging)return;
  var dx=e.touches[0].clientX-prevX;var dy=e.touches[0].clientY-prevY;
  totalMove+=Math.abs(dx)+Math.abs(dy);
  rotY+=dx*0.005;rotX+=dy*0.003;
  rotX=Math.max(-1,Math.min(1,rotX));
  prevX=e.touches[0].clientX;prevY=e.touches[0].clientY;
});
document.addEventListener('touchend',function(e){
  isDragging=false;
  var elapsed=Date.now()-startT;
  // Tap: short, with negligible movement.
  if(elapsed<280&&totalMove<10){handleTap(startX,startY);}
  setTimeout(function(){if(!isDragging)autoRotate=true},3000);
});
function a(){
  if(autoRotate)rotY+=0.003;
  G.rotation.y=rotY;G.rotation.x=rotX;
  r.render(s,c);
  requestAnimationFrame(a);
}
a();
<\/script></body></html>`;
}

function ContinentCard({
  continent,
  index,
}: {
  continent: (typeof DEFAULT_CONTINENTS)[0];
  index: number;
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

  return (
    <Animated.View style={[styles.continentCard, style]}>
      <View style={styles.continentIcon}>
        <Ionicons name={continent.icon} size={16} color="#00B894" />
      </View>
      <View style={styles.continentInfo}>
        <Text style={styles.continentName}>{continent.name}</Text>
        <Text style={styles.continentStats}>
          {continent.athletes} athletes · {continent.recruiters} recruiters
        </Text>
      </View>
    </Animated.View>
  );
}

export default function GlobeTab() {
  useFonts({
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Globe is an athletes-only vanity tab; everyone else lands on their
  // role's home via useRoleHomeRedirect (focus-based).
  const redirecting = useRoleHomeRedirect(["athlete"]);

  const [isActive, setIsActive] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const webviewRef = useRef<WebView>(null);
  const [CONTINENTS, setContinents] = useState(DEFAULT_CONTINENTS);
  const [points, setPoints] = useState<MapPoint[]>([]);

  // Fetch globe stats from API
  useEffect(() => {
    statsService
      .getGlobeStats()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setContinents(
            data.map((d: any, i: number) => ({
              ...DEFAULT_CONTINENTS[i],
              ...d,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  // Refresh the role-targeted map candidates on every focus, mirroring
  // how the home rank chip refreshes. Service has a null-safe → mock
  // fallback so this never hangs the WebView.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      discoverService.getMapPoints().then((rows) => {
        if (!cancelled) setPoints(rows);
      });
      return () => {
        cancelled = true;
      };
    }, []),
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
        })),
      ),
    [points],
  );

  // Tap-bridge handler: the HTML posts { type:'point', id } when a point
  // is tapped (raycast hit). A3 will use this id to surface a card.
  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          id?: string;
        };
        if (msg.type !== "point" || !msg.id) return;
        const hit = points.find((p) => p.id === msg.id);
        if (!hit) return;
        // A3 lands here — overlay the mini card. Stubbed for this commit.
      } catch {
        // Malformed payload — ignore.
      }
    },
    [points],
  );

  if (redirecting) return null;

  return (
    <View style={styles.container}>
      {/* Globe WebView — lazy loaded */}
      <View style={styles.globeContainer}>
        {isActive ? (
          <WebView
            // Re-key on the points fingerprint so a fresh fetch fully
            // remounts the WebView (and the inline three-globe state)
            // instead of relying on source-prop diffing.
            key={`globe-${points.length}-${points[0]?.id ?? "empty"}`}
            ref={webviewRef}
            source={{ html: globeHtml }}
            style={styles.webview}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleWebMessage}
          />
        ) : (
          <View style={styles.globePlaceholder}>
            <ActivityIndicator size="large" color="#00B894" />
          </View>
        )}
        {/* Gradient overlay at bottom for readability */}
        <View style={styles.bottomGradient} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Global Network</Text>
        <Text style={styles.headerSubtitle}>Talent distribution worldwide</Text>
      </View>

      {/* Toggle stats panel */}
      <View style={styles.bottomPanel}>
        <Pressable
          style={styles.toggleButton}
          onPress={() => setShowStats(!showStats)}
        >
          <Ionicons
            name={showStats ? "chevron-down" : "chevron-up"}
            size={18}
            color="rgba(255,255,255,0.7)"
          />
          <Text style={styles.toggleText}>
            {showStats ? "Hide" : "Talent Hotspots"}
          </Text>
        </Pressable>

        {showStats && (
          <View style={styles.continentList}>
            {CONTINENTS.map((c, i) => (
              <ContinentCard key={c.name} continent={c} index={i} />
            ))}
          </View>
        )}
      </View>

      {/* Instruction hint — centered above bottom panel */}
      {!showStats && (
        <View style={styles.hint}>
          <Ionicons
            name="hand-left-outline"
            size={14}
            color="rgba(255,255,255,0.4)"
          />
          <Text style={styles.hintText}>Drag to rotate the globe</Text>
        </View>
      )}
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
    top: 60,
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
  bottomPanel: {
    position: "absolute",
    bottom: 90,
    left: 16,
    right: 16,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    alignSelf: "center",
  },
  toggleText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: "rgba(255, 255, 255, 0.7)",
  },
  continentList: {
    marginTop: 10,
    gap: 6,
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
    bottom: 140,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  hintText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255, 255, 255, 0.4)",
  },
});
