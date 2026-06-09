import { Image as ExpoImage } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image as RNImage,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import { useTheme } from "../context/ThemeContext";

const { width: SW, height: SH } = Dimensions.get("window");
const OUTPUT_W = 1080;
const MAX_ZOOM = 5;
const MIN_ZOOM = 0.25;

type BgMode = "blur" | "black" | "white";

type Props = {
  visible: boolean;
  /** Local image uri to crop (file:// or content://). */
  uri: string | null;
  /** Target frame ratio = height / width (e.g. 1.55 = portrait compare cell). */
  aspect?: number;
  onDone: (croppedUri: string) => void;
  onCancel: () => void;
};

type Gesture = {
  mode: "none" | "pan" | "pinch";
  startDist: number;
  startScale: number;
  startTx: number;
  startTy: number;
  startCx: number;
  startCy: number;
};

/**
 * Drag + pinch/zoom cropper that captures EXACTLY what's framed (via
 * react-native-view-shot) — so what you see is what posts. Zooming out past the
 * cover point reveals a creative fill (blurred image, or solid black/white)
 * behind the photo, baked into the final image.
 */
export function CompareImageCropper({ visible, uri, aspect = 1.55, onDone, onCancel }: Props) {
  const { colors } = useTheme();
  const shotRef = useRef<View>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [bg, setBg] = useState<BgMode>("blur");
  const [saving, setSaving] = useState(false);

  // Frame (crop window) on screen — keep it inside the viewport.
  let fW = SW - 32;
  let fH = fW * aspect;
  const maxH = SH * 0.58;
  if (fH > maxH) { fH = maxH; fW = fH / aspect; }

  const baseScale = nat ? Math.max(fW / nat.w, fH / nat.h) : 1;
  const S = baseScale * scale;

  const cur = useRef({ scale: 1, tx: 0, ty: 0, baseScale: 1, natW: 1, natH: 1, fW: 1, fH: 1 });
  cur.current = { scale, tx, ty, baseScale, natW: nat?.w ?? 1, natH: nat?.h ?? 1, fW, fH };
  const g = useRef<Gesture>({ mode: "none", startDist: 1, startScale: 1, startTx: 0, startTy: 0, startCx: 0, startCy: 0 });

  // Keep the image inside the frame. When larger than the frame (zoomed in) it
  // can pan to any edge; when smaller (zoomed out) it floats within the frame.
  function clampT(txv: number, tyv: number, Sval: number) {
    const maxX = Math.abs(cur.current.natW * Sval - cur.current.fW) / 2;
    const maxY = Math.abs(cur.current.natH * Sval - cur.current.fH) / 2;
    return {
      tx: Math.min(maxX, Math.max(-maxX, txv)),
      ty: Math.min(maxY, Math.max(-maxY, tyv)),
    };
  }

  function setup(touches: { pageX: number; pageY: number }[]) {
    if (touches.length >= 2) {
      const [a, b] = touches;
      g.current = {
        mode: "pinch",
        startDist: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)),
        startScale: cur.current.scale,
        startTx: cur.current.tx,
        startTy: cur.current.ty,
        startCx: (a.pageX + b.pageX) / 2,
        startCy: (a.pageY + b.pageY) / 2,
      };
    } else if (touches.length === 1) {
      const t = touches[0];
      g.current = { mode: "pan", startDist: 1, startScale: cur.current.scale, startTx: cur.current.tx, startTy: cur.current.ty, startCx: t.pageX, startCy: t.pageY };
    }
  }

  function zoomBy(factor: number) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.current.scale * factor));
    const Snew = cur.current.baseScale * next;
    const c = clampT(cur.current.tx, cur.current.ty, Snew);
    setScale(next);
    setTx(c.tx);
    setTy(c.ty);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => setup(evt.nativeEvent.touches as { pageX: number; pageY: number }[]),
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches as { pageX: number; pageY: number }[];
        if (touches.length >= 2) {
          if (g.current.mode !== "pinch") setup(touches);
          const [a, b] = touches;
          const d = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
          const mx = (a.pageX + b.pageX) / 2;
          const my = (a.pageY + b.pageY) / 2;
          const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.current.startScale * (d / g.current.startDist)));
          const Snew = cur.current.baseScale * newScale;
          const c = clampT(g.current.startTx + (mx - g.current.startCx), g.current.startTy + (my - g.current.startCy), Snew);
          setScale(newScale);
          setTx(c.tx);
          setTy(c.ty);
        } else if (touches.length === 1) {
          if (g.current.mode !== "pan") setup(touches);
          const t = touches[0];
          const c = clampT(
            g.current.startTx + (t.pageX - g.current.startCx),
            g.current.startTy + (t.pageY - g.current.startCy),
            cur.current.baseScale * cur.current.scale,
          );
          setTx(c.tx);
          setTy(c.ty);
        }
      },
      onPanResponderRelease: () => { g.current.mode = "none"; },
      onPanResponderTerminate: () => { g.current.mode = "none"; },
    }),
  ).current;

  useEffect(() => {
    if (!uri) { setNat(null); return; }
    setScale(1);
    setTx(0);
    setTy(0);
    let alive = true;
    RNImage.getSize(
      uri,
      (w, h) => { if (alive) setNat({ w: w || 1, h: h || 1 }); },
      () => { if (alive) setNat({ w: 1, h: 1 }); },
    );
    return () => { alive = false; };
  }, [uri]);

  async function handleDone() {
    if (!uri || !nat || !shotRef.current) return;
    setSaving(true);
    try {
      // Capture the framed view exactly as shown (photo + fill) — WYSIWYG.
      const out = await captureRef(shotRef, {
        format: "jpg",
        quality: 0.92,
        result: "tmpfile",
        width: OUTPUT_W,
        height: Math.round(OUTPUT_W * (fH / fW)),
      });
      onDone(out);
    } catch {
      onCancel();
    } finally {
      setSaving(false);
    }
  }

  const imgW = nat ? nat.w * S : 0;
  const imgH = nat ? nat.h * S : 0;
  const imgStyle = {
    position: "absolute" as const,
    width: imgW,
    height: imgH,
    left: (fW - imgW) / 2 + tx,
    top: (fH - imgH) / 2 + ty,
  };

  const BG_MODES: { key: BgMode; label: string }[] = [
    { key: "blur", label: "Blur" },
    { key: "black", label: "Black" },
    { key: "white", label: "White" },
  ];

  return (
    <Modal visible={visible && !!uri} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Text style={styles.title}>Crop & position</Text>
        <Text style={styles.hint}>Drag · pinch or −/+ to zoom · what you see is what posts</Text>

        <View style={[styles.frameWrap, { width: fW, height: fH }]} {...pan.panHandlers}>
          {/* Captured area: background fill + the photo */}
          <View ref={shotRef} collapsable={false} style={{ width: fW, height: fH, backgroundColor: bg === "white" ? "#fff" : "#000" }}>
            {nat && bg === "blur" ? (
              <>
                <ExpoImage source={{ uri: uri ?? "" }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} />
              </>
            ) : null}
            {nat ? <ExpoImage source={{ uri: uri ?? "" }} style={imgStyle} contentFit="fill" /> : null}
          </View>

          {/* Non-captured overlays: border + rule-of-thirds guides */}
          {!nat ? <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" /> : null}
          <View pointerEvents="none" style={styles.frameBorder} />
          <View pointerEvents="none" style={[styles.guideV, { left: fW / 3 }]} />
          <View pointerEvents="none" style={[styles.guideV, { left: (fW / 3) * 2 }]} />
          <View pointerEvents="none" style={[styles.guideH, { top: fH / 3 }]} />
          <View pointerEvents="none" style={[styles.guideH, { top: (fH / 3) * 2 }]} />
        </View>

        {/* Zoom controls */}
        <View style={styles.zoomRow}>
          <Pressable style={styles.zoomBtn} onPress={() => zoomBy(1 / 1.25)} hitSlop={8}>
            <Text style={styles.zoomBtnText}>−</Text>
          </Pressable>
          <Text style={styles.zoomLabel}>{Math.round(scale * 100)}%</Text>
          <Pressable style={styles.zoomBtn} onPress={() => zoomBy(1.25)} hitSlop={8}>
            <Text style={styles.zoomBtnText}>+</Text>
          </Pressable>
        </View>

        {/* Background fill selector */}
        <View style={styles.bgRow}>
          <Text style={styles.bgRowLabel}>Fill</Text>
          {BG_MODES.map((m) => (
            <Pressable
              key={m.key}
              style={[styles.bgChip, bg === m.key && { borderColor: colors.accent, backgroundColor: colors.accent + "33" }]}
              onPress={() => setBg(m.key)}
            >
              <Text style={[styles.bgChipText, bg === m.key && { color: "#fff" }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel} disabled={saving}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.accent }, saving && { opacity: 0.6 }]}
            onPress={() => void handleDone()}
            disabled={saving || !nat}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Use photo</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 16 },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  hint: { color: "#cbd5e1", fontSize: 12, marginTop: -6, textAlign: "center" },
  frameWrap: { overflow: "hidden", borderRadius: 12, backgroundColor: "#000" },
  frameBorder: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)" },
  guideV: { position: "absolute", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.3)" },
  guideH: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.3)" },
  zoomRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 2 },
  zoomBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center" },
  zoomBtnText: { color: "#fff", fontSize: 24, fontWeight: "800", lineHeight: 26 },
  zoomLabel: { color: "#fff", fontSize: 13, fontWeight: "700", minWidth: 52, textAlign: "center" },
  bgRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bgRowLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "700", marginRight: 2 },
  bgChip: { borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  bgChipText: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12, marginTop: 6 },
  btn: { borderRadius: 12, paddingHorizontal: 26, paddingVertical: 13, alignItems: "center", justifyContent: "center", minWidth: 120 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  btnGhost: { borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  btnGhostText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
