import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, Pressable, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import {
  useFonts,
  Poppins_500Medium,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { theme } from '@/config/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const LOGO_SIZE = SCREEN_WIDTH * 0.45;
const GLOBE_SIZE = SCREEN_WIDTH * 0.68;

// ── Timing (ms) ──
const LOGO_FADE_IN = 200;
const LOGO_VISIBLE = 1800;
const LOGO_FADE_OUT = 500;
const LOGO_TOTAL = LOGO_FADE_IN + LOGO_VISIBLE + LOGO_FADE_OUT; // 2500

const GLOBE_START = LOGO_TOTAL; // 2500
const GLOBE_FADE_IN = 800;
const STATS_STAGGER_START = GLOBE_START + 600;
const FADE_OUT_START = GLOBE_START + 4500; // 7000
const FADE_OUT_DURATION = 600;
const FINISH = FADE_OUT_START + FADE_OUT_DURATION + 100; // ~7700

// ── Three.js Globe HTML ──
const globeHtml = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>*{margin:0;padding:0}body{overflow:hidden;background:transparent;touch-action:none}#g{width:100vw;height:100vh}</style>
</head><body><div id="g"></div>
<script src="https://unpkg.com/three@0.160.0/build/three.min.js"><\/script>
<script src="https://unpkg.com/three-globe@2.45.0/dist/three-globe.min.js"><\/script>
<script>
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
var pts=[
{lat:39.8,lng:-98.6},{lat:56.1,lng:-106.3},{lat:55.4,lng:-3.4},
{lat:46.2,lng:2.2},{lat:51.2,lng:10.5},{lat:-14.2,lng:-51.9},
{lat:36.2,lng:138.3},{lat:-25.3,lng:133.8},{lat:9.1,lng:8.7},
{lat:20.6,lng:79},{lat:-30.6,lng:22.9},{lat:35.9,lng:127.8},
{lat:23.6,lng:-102.6},{lat:40.5,lng:-3.7}
];
var G=new ThreeGlobe()
.globeImageUrl('https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg')
.bumpImageUrl('https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png')
.arcsData(arcs).arcColor(function(){return['rgba(0,184,148,0.6)','rgba(116,185,255,0.6)']})
.arcStroke(0.5).arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(2500)
.pointsData(pts).pointColor(function(){return'#00B894'}).pointAltitude(0.01).pointRadius(0.4);
var r=new THREE.WebGLRenderer({alpha:true,antialias:true});
r.setPixelRatio(Math.min(window.devicePixelRatio,2));
r.setSize(window.innerWidth,window.innerHeight);
document.getElementById('g').appendChild(r.domElement);
var s=new THREE.Scene();s.add(G);
s.add(new THREE.AmbientLight(0xffffff,1.2));
var d=new THREE.DirectionalLight(0xffffff,0.8);d.position.set(6,3,5);s.add(d);
var ag=new THREE.SphereGeometry(101,32,32);
var am=new THREE.MeshBasicMaterial({color:0x4488ff,transparent:true,opacity:0.08,side:THREE.BackSide});
s.add(new THREE.Mesh(ag,am));
var c=new THREE.PerspectiveCamera(50,window.innerWidth/window.innerHeight,0.1,1000);
c.position.z=240;
function a(){G.rotation.y+=0.004;r.render(s,c);requestAnimationFrame(a)}a();
<\/script></body></html>`;

// ── Stats data ──
const STATS = [
  { target: 10000, suffix: '+', label: 'Athletes' },
  { target: 500, suffix: '+', label: 'Recruiters' },
  { target: 50, suffix: '+', label: 'Countries' },
];

// ── JS-side animated counter (no worklets, no crash) ──
function useJSCounter(target: number, duration: number, startAt: number) {
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const startTimer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      const steps = 40;
      const interval = duration / steps;
      let step = 0;
      const tick = setInterval(() => {
        step++;
        const progress = step / steps;
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.floor(target * eased));
        if (step >= steps) clearInterval(tick);
      }, interval);
    }, startAt);
    return () => clearTimeout(startTimer);
  }, []);

  return value.toLocaleString('en-US');
}

function StatColumn({ stat, index }: { stat: typeof STATS[0]; index: number }) {
  const delay = STATS_STAGGER_START + index * 250;
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const display = useJSCounter(stat.target, 1600, delay + 200);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
    scale.value = withDelay(delay, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.statColumn, style]}>
      <View style={styles.statAccent} />
      <Text style={styles.statNumber}>
        {display}
        <Text style={styles.statSuffix}>{stat.suffix}</Text>
      </Text>
      <Text style={styles.statLabel}>{stat.label}</Text>
    </Animated.View>
  );
}

// ── Main ──
interface SplashExperienceProps {
  onAnimationComplete?: () => void;
  fadeInDuration?: number;
  animationDelay?: number;
  displayDuration?: number;
}

export const SplashExperience: React.FC<SplashExperienceProps> = ({ onAnimationComplete }) => {
  useFonts({ Poppins_500Medium, Poppins_700Bold, Poppins_800ExtraBold });

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.7);
  const glowOpacity = useSharedValue(0);
  const globeOpacity = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);
  const taglineTranslateY = useSharedValue(12);
  const titleOpacity = useSharedValue(0);
  const contentFade = useSharedValue(1);

  useEffect(() => {
    // ── LOGO: fade in → pulse → fade out ──
    logoOpacity.value = withDelay(LOGO_FADE_IN, withSequence(
      withTiming(1, { duration: 800, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      withTiming(1, { duration: LOGO_VISIBLE - 800 }),
      withTiming(0, { duration: LOGO_FADE_OUT }),
    ));
    logoScale.value = withDelay(LOGO_FADE_IN, withSequence(
      withTiming(1, { duration: 800, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      withTiming(1.04, { duration: 300 }),
      withTiming(1, { duration: 300 }),
      withTiming(1, { duration: LOGO_VISIBLE - 1400 }),
      withTiming(1.02, { duration: LOGO_FADE_OUT }),
    ));
    glowOpacity.value = withDelay(LOGO_FADE_IN + 100, withSequence(
      withTiming(0.3, { duration: 700 }),
      withTiming(0.3, { duration: LOGO_VISIBLE - 700 }),
      withTiming(0, { duration: LOGO_FADE_OUT }),
    ));

    // ── GLOBE: fade in ──
    globeOpacity.value = withDelay(GLOBE_START, withTiming(1, { duration: GLOBE_FADE_IN }));

    // ── Tagline: appears with globe ──
    taglineOpacity.value = withDelay(GLOBE_START + 200, withTiming(1, { duration: 600 }));
    taglineTranslateY.value = withDelay(GLOBE_START + 200, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));

    // ── Title ──
    titleOpacity.value = withDelay(STATS_STAGGER_START - 200, withTiming(1, { duration: 500 }));

    // ── Fade out all content before transition ──
    contentFade.value = withDelay(FADE_OUT_START, withTiming(0, { duration: FADE_OUT_DURATION }));

    // ── FINISH ──
    const timer = setTimeout(() => {
      onAnimationComplete?.();
    }, FINISH);

    return () => clearTimeout(timer);
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));
  const globeStyle = useAnimatedStyle(() => ({ opacity: globeOpacity.value }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineTranslateY.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: contentFade.value }));

  return (
    <View style={styles.container}>
      {/* LOGO — shows first, fades out independently */}
      <View style={styles.centerLayer} pointerEvents="none">
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.Image
          source={require('@/assets/logo_white.png')}
          style={[styles.logo, logoStyle]}
          resizeMode="contain"
        />
      </View>

      {/* Content that fades out together at the end */}
      <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents="box-none">
        {/* GLOBE + STATS — centered vertically */}
        <Animated.View style={[styles.contentLayer, globeStyle]} pointerEvents="none">
          {/* Tagline */}
          <Animated.View style={[styles.taglineWrap, taglineStyle]}>
            <Text style={styles.taglineMain}>Welcome to GetDraft</Text>
            <Text style={styles.taglineSub}>where Talent has no Borders</Text>
          </Animated.View>

          {/* Globe in circular container */}
          <View style={styles.globeRing}>
            <View style={styles.globeClip}>
              <WebView
                source={{ html: globeHtml }}
                style={styles.webview}
                scrollEnabled={false}
                bounces={false}
                javaScriptEnabled
                domStorageEnabled
              />
            </View>
          </View>

          {/* Title */}
          <Animated.Text style={[styles.statsTitle, titleStyle]}>
            GetDraft by the Numbers
          </Animated.Text>

          {/* Stats bar — three columns */}
          <View style={styles.statsBar}>
            {STATS.map((stat, i) => (
              <React.Fragment key={stat.label}>
                {i > 0 && <View style={styles.statDivider} />}
                <StatColumn stat={stat} index={i} />
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        {/* Skip */}
        <Pressable style={styles.skipButton} onPress={() => onAnimationComplete?.()}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },

  // Logo layer
  centerLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    width: LOGO_SIZE * 2.5,
    height: LOGO_SIZE * 2.5,
    borderRadius: LOGO_SIZE * 1.25,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, tintColor: '#FFFFFF' },

  // Globe + Stats content layer
  contentLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  taglineWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  taglineMain: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  taglineSub: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: 2,
    fontStyle: 'italic',
  },
  globeRing: {
    width: GLOBE_SIZE + 4,
    height: GLOBE_SIZE + 4,
    borderRadius: (GLOBE_SIZE + 4) / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 184, 148, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  globeClip: {
    width: GLOBE_SIZE,
    height: GLOBE_SIZE,
    borderRadius: GLOBE_SIZE / 2,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // Stats
  statsTitle: {
    fontSize: 17,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 18,
    letterSpacing: 0.3,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 20,
    width: '100%',
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 4,
  },
  statAccent: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#00B894',
    marginBottom: 10,
  },
  statNumber: {
    fontSize: 22,
    fontFamily: 'Poppins_800ExtraBold',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  statSuffix: {
    color: '#00B894',
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },

  // Skip
  skipButton: {
    position: 'absolute',
    bottom: 60,
    right: 28,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  skipText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255, 255, 255, 0.7)',
  },
});

export default SplashExperience;
