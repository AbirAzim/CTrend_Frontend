import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import {
	Modal,
	PanResponder,
	Pressable,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { clampFocal, DEFAULT_IMAGE_FOCAL, imageContentPosition } from '../lib/imageFocal';
import { useTheme } from '../context/ThemeContext';

type Props = {
	visible: boolean;
	src: string;
	label: string;
	focalX: number;
	focalY: number;
	onChange: (focalX: number, focalY: number) => void;
	onClose: () => void;
};

const FRAME_H = 280;

/** Drag-to-reposition modal that sets a per-option image focal point (0–100). Phase 28. */
export function ImagePositionEditor({
	visible,
	src,
	label,
	focalX,
	focalY,
	onChange,
	onClose,
}: Props) {
	const { colors } = useTheme();
	const [localX, setLocalX] = useState(focalX);
	const [localY, setLocalY] = useState(focalY);
	const frame = useRef({ width: 1, height: 1 });
	const start = useRef({ x: DEFAULT_IMAGE_FOCAL, y: DEFAULT_IMAGE_FOCAL });
	// Keep refs in sync so the gesture (created once) reads fresh values.
	const localRef = useRef({ x: focalX, y: focalY });
	localRef.current = { x: localX, y: localY };

	const pan = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: () => {
				start.current = { x: localRef.current.x, y: localRef.current.y };
			},
			onPanResponderMove: (_, g) => {
				const { width, height } = frame.current;
				if (width < 1 || height < 1) return;
				// Drag the image: moving right reveals the right side → focal decreases.
				setLocalX(clampFocal(start.current.x - (g.dx / width) * 100));
				setLocalY(clampFocal(start.current.y - (g.dy / height) * 100));
			},
		}),
	).current;

	function handleDone() {
		onChange(clampFocal(localX), clampFocal(localY));
		onClose();
	}

	return (
		<Modal visible={visible} transparent animationType='fade' onRequestClose={onClose}>
			<View style={styles.overlay}>
				<View style={[styles.card, { backgroundColor: colors.card }]}>
					<View style={styles.head}>
						<Text style={[styles.title, { color: colors.text }]}>Adjust position</Text>
						<Pressable onPress={onClose} hitSlop={10}>
							<Text style={[styles.close, { color: colors.muted }]}>✕</Text>
						</Pressable>
					</View>

					<Text style={[styles.hint, { color: colors.muted }]}>
						Drag the image so the important part shows in the frame. This matches how it appears in the feed.
					</Text>

					<View
						style={[styles.frame, { borderColor: colors.border }]}
						onLayout={(e) => {
							frame.current = {
								width: e.nativeEvent.layout.width,
								height: e.nativeEvent.layout.height,
							};
						}}
						{...pan.panHandlers}>
						<Image
							source={{ uri: src }}
							style={styles.img}
							contentFit='cover'
							contentPosition={imageContentPosition(localX, localY)}
							cachePolicy='memory-disk'
						/>
						<View style={styles.frameLabel}>
							<Text style={styles.frameLabelText} numberOfLines={1}>{label}</Text>
						</View>
						{/* Center crosshair guide */}
						<View pointerEvents='none' style={styles.crosshairV} />
						<View pointerEvents='none' style={styles.crosshairH} />
					</View>

					<Text style={[styles.coords, { color: colors.muted }]}>
						X {clampFocal(localX)}%  ·  Y {clampFocal(localY)}%
					</Text>

					<View style={styles.footer}>
						<Pressable
							style={[styles.btn, styles.btnGhost, { borderColor: colors.border }]}
							onPress={() => { setLocalX(DEFAULT_IMAGE_FOCAL); setLocalY(DEFAULT_IMAGE_FOCAL); }}>
							<Text style={[styles.btnGhostText, { color: colors.subtext }]}>Reset</Text>
						</Pressable>
						<Pressable
							style={[styles.btn, styles.btnGhost, { borderColor: colors.border }]}
							onPress={onClose}>
							<Text style={[styles.btnGhostText, { color: colors.subtext }]}>Cancel</Text>
						</Pressable>
						<Pressable
							style={[styles.btn, { backgroundColor: colors.accent }]}
							onPress={handleDone}>
							<Text style={styles.btnPrimaryText}>Done</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		paddingHorizontal: 18,
	},
	card: { borderRadius: 18, padding: 16 },
	head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
	title: { fontSize: 16, fontWeight: '800' },
	close: { fontSize: 18, fontWeight: '700' },
	hint: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
	frame: {
		height: FRAME_H,
		borderRadius: 12,
		borderWidth: 1,
		overflow: 'hidden',
		backgroundColor: '#000',
	},
	img: { width: '100%', height: '100%' },
	frameLabel: {
		position: 'absolute',
		left: 8,
		bottom: 8,
		backgroundColor: 'rgba(0,0,0,0.6)',
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 3,
		maxWidth: '80%',
	},
	frameLabelText: { color: '#fff', fontSize: 11, fontWeight: '700' },
	crosshairV: {
		position: 'absolute',
		left: '50%',
		top: 0,
		bottom: 0,
		width: 1,
		backgroundColor: 'rgba(255,255,255,0.35)',
	},
	crosshairH: {
		position: 'absolute',
		top: '50%',
		left: 0,
		right: 0,
		height: 1,
		backgroundColor: 'rgba(255,255,255,0.35)',
	},
	coords: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 10, fontVariant: ['tabular-nums'] },
	footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
	btn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
	btnGhost: { borderWidth: 1 },
	btnGhostText: { fontSize: 13, fontWeight: '700' },
	btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});

export default ImagePositionEditor;
