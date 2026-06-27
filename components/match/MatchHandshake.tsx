import React, { useCallback, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

/**
 * MatchHandshake — the celebratory centrepiece of the "It's a Match!" screen.
 *
 * Rendered with WebView + Three.js (Three loaded from the unpkg CDN inside an
 * inlined HTML document) — the SAME proven stack the globe tab uses. We do NOT
 * use expo-three / expo-gl here (those have crashed in this app). This needs a
 * dev/production build and will not run in Expo Go — that is expected.
 *
 * Two stylized low-poly hands perform a full handshake loop:
 *   approach → clasp (fingers curl) → 2–3 damped shakes → hold → release.
 * The motion is JS-driven inside the WebView's requestAnimationFrame loop
 * (real browser context — performance.now() etc. are all available there), so
 * there are no Reanimated worklets involved and no Hermes SIGABRT risk.
 *
 * Polish lives in: ACES filmic tone mapping, a 4-light rig (warm key, brand
 * rim/back light, cool fill, plus a clasp "spark" point light), a soft contact
 * shadow caught on a ShadowMaterial plane, antialiasing, capped devicePixelRatio,
 * and a brand-coloured particle burst on each clasp.
 */

export interface MatchHandshakeProps {
  /** Brand-green accent, drives rim light + particles. */
  accent?: string;
  /** Cool fill accent. */
  accent2?: string;
  /** Warm sparkle accent (gold). */
  accent3?: string;
  /** Fired once the Three scene has initialised and rendered its first frame. */
  onReady?: () => void;
  /** Fired if WebGL/Three failed to start — caller should fall back to a static image. */
  onError?: () => void;
  style?: object;
}

function buildHandshakeHtml(accent: string, accent2: string, accent3: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:transparent;touch-action:none}
#c{width:100vw;height:100vh;display:block}
</style>
</head><body>
<canvas id="c"></canvas>
<script src="https://unpkg.com/three@0.160.0/build/three.min.js"><\/script>
<script>
(function(){
  function post(m){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); } }
  try {
    var ACC='${accent}';      // brand green
    var ACC2='${accent2}';    // cool blue
    var ACC3='${accent3}';    // warm gold
    var SKIN_L='#E8B68C';     // two distinct skin tones — two different people meeting
    var SKIN_R='#B97A4F';
    var CUFF_L='#0E8C73';     // sporty jersey cuffs
    var CUFF_R='#262A33';

    var canvas=document.getElementById('c');
    var W=window.innerWidth, H=window.innerHeight;

    var renderer=new THREE.WebGLRenderer({canvas:canvas, alpha:true, antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setSize(W,H,false);
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    if(THREE.SRGBColorSpace){ renderer.outputColorSpace=THREE.SRGBColorSpace; }
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.12;

    var scene=new THREE.Scene();

    var camera=new THREE.PerspectiveCamera(35, W/H, 0.1, 100);
    camera.position.set(0.35, 1.05, 9.2);
    camera.lookAt(0, -0.08, 0);

    // ── Lighting rig ───────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x2a1d12, 0.55));

    var key=new THREE.DirectionalLight(0xfff1dc, 2.7);
    key.position.set(4.5, 7.5, 5.5);
    key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);
    key.shadow.camera.near=0.5; key.shadow.camera.far=30;
    key.shadow.camera.left=-6; key.shadow.camera.right=6;
    key.shadow.camera.top=6; key.shadow.camera.bottom=-6;
    key.shadow.bias=-0.0006; key.shadow.radius=7;
    scene.add(key);

    // Brand rim/back light — gives the silhouettes a green edge glow.
    var rim=new THREE.DirectionalLight(ACC, 3.4);
    rim.position.set(-4.5, 3.0, -5.5);
    scene.add(rim);

    // Cool fill from the left to keep the shadow side from going muddy.
    var fill=new THREE.DirectionalLight(ACC2, 0.9);
    fill.position.set(-6.0, 1.0, 6.0);
    scene.add(fill);

    // Clasp "spark" — flashes the moment the hands grip.
    var spark=new THREE.PointLight(ACC, 0.0, 9, 2);
    spark.position.set(0, 0.05, 0.7);
    scene.add(spark);

    // ── Soft contact shadow catcher ────────────────────────────────
    var groundMat=new THREE.ShadowMaterial({opacity:0.34});
    var ground=new THREE.Mesh(new THREE.PlaneGeometry(60,60), groundMat);
    ground.rotation.x=-Math.PI/2;
    ground.position.y=-2.35;
    ground.receiveShadow=true;
    scene.add(ground);

    // ── Hand builder ───────────────────────────────────────────────
    // Built in a "reaching +X" local frame: forearm trails to -X, the fist
    // and fingers reach toward +X (the clasp at the origin). The right hand
    // re-uses the same geometry mirrored via scale.x = -1.
    function makeHand(skin, cuff){
      var g=new THREE.Group();
      var matSkin=new THREE.MeshStandardMaterial({color:new THREE.Color(skin), roughness:0.62, metalness:0.0, side:THREE.DoubleSide});
      var matCuff=new THREE.MeshStandardMaterial({color:new THREE.Color(cuff), roughness:0.85, metalness:0.0, side:THREE.DoubleSide});

      var fa=new THREE.Mesh(new THREE.CapsuleGeometry(0.46,1.7,8,20), matSkin);
      fa.rotation.z=Math.PI/2; fa.position.set(-1.25,-0.05,0);
      fa.castShadow=true; fa.receiveShadow=true; g.add(fa);

      var cf=new THREE.Mesh(new THREE.CapsuleGeometry(0.55,0.46,8,20), matCuff);
      cf.rotation.z=Math.PI/2; cf.position.set(-1.98,-0.05,0);
      cf.castShadow=true; g.add(cf);

      // Fist/palm — a rounded capsule squashed into a paddle.
      var palm=new THREE.Mesh(new THREE.CapsuleGeometry(0.5,0.5,12,22), matSkin);
      palm.scale.set(1.18,1.0,0.64); palm.position.set(0.18,-0.05,0);
      palm.castShadow=true; palm.receiveShadow=true; g.add(palm);

      // Knuckle ridge for a little anatomical read.
      var knuck=new THREE.Mesh(new THREE.CapsuleGeometry(0.16,0.62,6,12), matSkin);
      knuck.rotation.x=Math.PI/2; knuck.position.set(0.62,0.2,0);
      knuck.castShadow=true; g.add(knuck);

      // Four fingers — each on its own pivot so it can curl to grip.
      var fingers=[];
      var ys=[0.32,0.11,-0.10,-0.32];
      for(var i=0;i<4;i++){
        var piv=new THREE.Group();
        piv.position.set(0.72, ys[i], 0.05);
        var fg=new THREE.Mesh(new THREE.CapsuleGeometry(0.145,0.40,6,14), matSkin);
        fg.rotation.z=Math.PI/2; fg.position.set(0.33,0,0); fg.castShadow=true;
        // a soft second segment so a curled finger reads as two knuckles
        var tip=new THREE.Mesh(new THREE.CapsuleGeometry(0.125,0.16,6,12), matSkin);
        tip.rotation.z=Math.PI/2; tip.position.set(0.62,0,0); tip.castShadow=true;
        piv.add(fg); piv.add(tip);
        g.add(piv); fingers.push(piv);
      }

      // Thumb — tucks over the clasp.
      var tp=new THREE.Group();
      tp.position.set(0.46,0.40,0.18);
      var th=new THREE.Mesh(new THREE.CapsuleGeometry(0.17,0.34,6,14), matSkin);
      th.rotation.z=Math.PI/2.3; th.position.set(0.2,0.04,0); th.castShadow=true;
      tp.add(th); g.add(tp);

      return {group:g, fingers:fingers, thumb:tp};
    }

    // rig holds both hands; it carries the shared shake + idle sway.
    var rig=new THREE.Group();
    rig.rotation.y=-0.20;
    rig.rotation.x=0.06;
    scene.add(rig);

    var left=makeHand(SKIN_L, CUFF_L);
    var right=makeHand(SKIN_R, CUFF_R);
    right.group.scale.x=-1; // mirror into a right hand
    rig.add(left.group);
    rig.add(right.group);

    var START_L={x:-3.5,y:-0.8}, CLASP_L={x:-0.14,y:0.0};
    var START_R={x:3.5,y:-0.8},  CLASP_R={x:0.14,y:0.0};

    // ── Particle burst ─────────────────────────────────────────────
    // Soft additive sprites that fan out + drift up each time hands clasp.
    var P=70;
    var pPos=new Float32Array(P*3);
    var pCol=new Float32Array(P*3);
    var pVel=[]; var pLife=new Float32Array(P); var pMax=new Float32Array(P);
    var pBase=[];
    var palette=[new THREE.Color(ACC), new THREE.Color(ACC2), new THREE.Color(ACC3), new THREE.Color('#ffffff')];
    function rnd(a,b){ return a+(b-a)*Math.random(); }
    for(var i=0;i<P;i++){
      pPos[i*3]=0; pPos[i*3+1]=0; pPos[i*3+2]=0.6;
      var bc=palette[i%palette.length];
      pBase.push(bc); pCol[i*3]=0; pCol[i*3+1]=0; pCol[i*3+2]=0;
      pVel.push({x:0,y:0,z:0}); pLife[i]=999; pMax[i]=1;
    }
    var pGeo=new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos,3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol,3));
    // round soft sprite drawn to a canvas
    var ptex=(function(){
      var cv=document.createElement('canvas'); cv.width=64; cv.height=64;
      var x=cv.getContext('2d');
      var grd=x.createRadialGradient(32,32,0,32,32,32);
      grd.addColorStop(0,'rgba(255,255,255,1)');
      grd.addColorStop(0.4,'rgba(255,255,255,0.6)');
      grd.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle=grd; x.beginPath(); x.arc(32,32,32,0,Math.PI*2); x.fill();
      var t=new THREE.CanvasTexture(cv);
      if(THREE.SRGBColorSpace){ t.colorSpace=THREE.SRGBColorSpace; }
      return t;
    })();
    var pMat=new THREE.PointsMaterial({size:0.46, map:ptex, vertexColors:true, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true});
    var points=new THREE.Points(pGeo, pMat);
    rig.add(points);

    function burst(){
      for(var i=0;i<P;i++){
        pPos[i*3]=rnd(-0.25,0.25);
        pPos[i*3+1]=rnd(-0.2,0.25);
        pPos[i*3+2]=0.6+rnd(-0.2,0.4);
        var ang=rnd(0,Math.PI*2), sp=rnd(1.2,3.4);
        pVel[i].x=Math.cos(ang)*sp*0.7;
        pVel[i].y=rnd(1.4,3.6);
        pVel[i].z=Math.sin(ang)*sp*0.5;
        pLife[i]=0; pMax[i]=rnd(0.9,1.6);
      }
    }

    // Soft brand glow disc behind the clasp.
    var glowTex=(function(){
      var cv=document.createElement('canvas'); cv.width=128; cv.height=128;
      var x=cv.getContext('2d');
      var grd=x.createRadialGradient(64,64,0,64,64,64);
      grd.addColorStop(0,'rgba(255,255,255,0.9)');
      grd.addColorStop(0.3,'rgba(255,255,255,0.35)');
      grd.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle=grd; x.beginPath(); x.arc(64,64,64,0,Math.PI*2); x.fill();
      var t=new THREE.CanvasTexture(cv);
      if(THREE.SRGBColorSpace){ t.colorSpace=THREE.SRGBColorSpace; }
      return t;
    })();
    var glowMat=new THREE.SpriteMaterial({map:glowTex, color:new THREE.Color(ACC), transparent:true, opacity:0.0, depthWrite:false, blending:THREE.AdditiveBlending});
    var glow=new THREE.Sprite(glowMat);
    glow.scale.set(6,6,1); glow.position.set(0,0.0,-1.2);
    rig.add(glow);

    // ── Easing helpers ─────────────────────────────────────────────
    function clamp01(v){ return v<0?0:(v>1?1:v); }
    function easeOutCubic(t){ t=clamp01(t); return 1-Math.pow(1-t,3); }
    function easeInOutCubic(t){ t=clamp01(t); return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; }
    function lerp(a,b,t){ return a+(b-a)*t; }

    // ── Cycle clock ────────────────────────────────────────────────
    // approach 0-1.05 | clasp 1.05-1.5 | shakes 1.5-3.1 | hold 3.1-4.4 | release 4.4-5.7
    var T=5.7;
    var t0=performance.now();
    var bursted=false;
    var firstFrame=true;

    function frame(now){
      var elapsed=(now-t0)/1000;
      var t=elapsed % T;
      if(t < 0.05){ bursted=false; }

      // approach / release blend (e) + finger curl (c)
      var e, c;
      if(t < 1.05){              // approach
        e=easeOutCubic(t/1.05);
        c=easeOutCubic(clamp01((t-0.55)/0.75));   // fingers start closing late
      } else if(t < 4.4){        // clasp + shakes + hold
        e=1; c=1;
      } else {                   // release
        var rt=(t-4.4)/1.3;
        e=1-easeInOutCubic(rt);
        c=1-easeInOutCubic(clamp01((rt-0.1)/0.7));
      }

      // hand positions (approach blend)
      left.group.position.x=lerp(START_L.x, CLASP_L.x, e);
      left.group.position.y=lerp(START_L.y, CLASP_L.y, e);
      right.group.position.x=lerp(START_R.x, CLASP_R.x, e);
      right.group.position.y=lerp(START_R.y, CLASP_R.y, e);
      // a touch of wrist tilt as they rise into the clasp
      left.group.rotation.z=lerp(0.22,0.0,e);
      right.group.rotation.z=lerp(0.22,0.0,e);

      // finger curl (slightly staggered per finger for organic grip)
      for(var fi=0; fi<4; fi++){
        var stagger=1 - fi*0.06;
        var ca=-1.62*c*stagger;
        left.fingers[fi].rotation.z=ca;
        right.fingers[fi].rotation.z=ca;
      }
      left.thumb.rotation.z=-0.62*c;
      right.thumb.rotation.z=-0.62*c;

      // clasp pop — gentle scale settle just after the grip lands
      var cp=clamp01((t-1.05)/0.5);
      var pop=1 + Math.sin(cp*Math.PI)*0.045;

      // shakes — clasped pair moves as a unit, damped
      var shakeY=0, shakeRot=0;
      if(t>=1.5 && t<3.1){
        var st=(t-1.5)/1.6;
        var damp=Math.exp(-2.0*st);
        shakeY=Math.sin(st*Math.PI*2*2.6)*0.34*damp;
        shakeRot=Math.sin(st*Math.PI*2*2.6)*0.05*damp;
      }
      // hold — gentle breathing
      var breathe=0;
      if(t>=3.1 && t<4.4){ breathe=Math.sin((t-3.1)*1.7)*0.022; }

      rig.position.y=shakeY+breathe;
      rig.rotation.z=shakeRot;
      rig.rotation.y=-0.20 + Math.sin(elapsed*0.5)*0.05;   // slow idle sway
      var s=pop;
      rig.scale.set(s,s,s);

      // clasp spark flash + glow
      var flash=0;
      if(t>=1.0 && t<2.0){ flash=Math.max(0, 1-(t-1.0)/1.0); flash=flash*flash; }
      spark.intensity=flash*7.0;
      glowMat.opacity=Math.max(flash*0.55, c*0.12);
      var gs=5.4 + flash*2.2;
      glow.scale.set(gs,gs,1);

      // trigger the particle burst as the grip lands
      if(!bursted && t>=1.02){ burst(); bursted=true; }

      // integrate particles
      var dt=0.016;
      for(var i=0;i<P;i++){
        if(pLife[i]<pMax[i]){
          pLife[i]+=dt;
          pVel[i].y-=2.6*dt;          // light gravity
          pPos[i*3]+=pVel[i].x*dt;
          pPos[i*3+1]+=pVel[i].y*dt;
          pPos[i*3+2]+=pVel[i].z*dt;
          var a=clamp01(1-pLife[i]/pMax[i]);
          a=a*a;                       // ease the fade
          pCol[i*3]=pBase[i].r*a;
          pCol[i*3+1]=pBase[i].g*a;
          pCol[i*3+2]=pBase[i].b*a;
        } else {
          pCol[i*3]=0; pCol[i*3+1]=0; pCol[i*3+2]=0;
        }
      }
      pGeo.attributes.position.needsUpdate=true;
      pGeo.attributes.color.needsUpdate=true;

      renderer.render(scene,camera);
      if(firstFrame){ firstFrame=false; post({type:'ready'}); }
      rafId=requestAnimationFrame(frame);
    }
    var rafId=requestAnimationFrame(frame);

    window.addEventListener('resize', function(){
      W=window.innerWidth; H=window.innerHeight;
      camera.aspect=W/H; camera.updateProjectionMatrix();
      renderer.setSize(W,H,false);
    });

    // Best-effort teardown so a backgrounded WebView frees GL resources.
    function dispose(){
      try {
        cancelAnimationFrame(rafId);
        scene.traverse(function(o){
          if(o.geometry) o.geometry.dispose();
          if(o.material){
            if(Array.isArray(o.material)){ o.material.forEach(function(m){m.dispose();}); }
            else o.material.dispose();
          }
        });
        ptex.dispose(); glowTex.dispose();
        renderer.dispose();
      } catch(e){}
    }
    window.addEventListener('pagehide', dispose);
    window.addEventListener('beforeunload', dispose);
    document.addEventListener('message', function(ev){ if(ev && ev.data==='dispose'){ dispose(); } });
    window.addEventListener('message', function(ev){ if(ev && ev.data==='dispose'){ dispose(); } });
  } catch(err){
    post({type:'error', message:(err && err.message) ? err.message : String(err)});
  }
})();
<\/script>
</body></html>`;
}

export function MatchHandshake({
  accent = "#00B894",
  accent2 = "#74B9FF",
  accent3 = "#FDCB6E",
  onReady,
  onError,
  style,
}: MatchHandshakeProps) {
  const webRef = useRef<WebView>(null);

  const html = useMemo(
    () => buildHandshakeHtml(accent, accent2, accent3),
    [accent, accent2, accent3],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          message?: string;
        };
        if (msg.type === "ready") onReady?.();
        else if (msg.type === "error") onError?.();
      } catch {
        // ignore malformed bridge payloads
      }
    },
    [onReady, onError],
  );

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <WebView
        ref={webRef}
        source={{ html }}
        style={styles.webview}
        // Decorative only — never interactive, so taps fall through to RN.
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        androidLayerType="hardware"
        // A WebGL failure shouldn't blank the screen — surface it so the
        // celebration can swap in its static fallback.
        onError={() => onError?.()}
        onRenderProcessGone={() => onError?.()}
        onMessage={handleMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
