import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
	BackHandler,
	Dimensions,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W / 4;
const SWIPE_VELOCITY = 800;

interface ImageViewerModalProps {
	visible: boolean;
	imageUrls: string[];
	initialIndex?: number;
	onClose: () => void;
}

export function ImageViewerModal({
	visible,
	imageUrls,
	initialIndex = 0,
	onClose,
}: ImageViewerModalProps) {
	const insets = useSafeAreaInsets();
	const count = imageUrls.length;

	const [currentIndex, setCurrentIndex] = useState(initialIndex);
	const currentIndexShared = useSharedValue(initialIndex);

	// Carousel position (whole row), in screen-widths.
	const carouselX = useSharedValue(-initialIndex * SCREEN_W);
	const dragX = useSharedValue(0);

	// Zoom transform — only ever applies to the currently active page; reset on page change.
	const scale = useSharedValue(1);
	const savedScale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const savedTranslateX = useSharedValue(0);
	const savedTranslateY = useSharedValue(0);

	useEffect(() => {
		if (!visible) return;
		setCurrentIndex(initialIndex);
		currentIndexShared.value = initialIndex;
		carouselX.value = -initialIndex * SCREEN_W;
		dragX.value = 0;
		scale.value = 1;
		savedScale.value = 1;
		translateX.value = 0;
		translateY.value = 0;
		savedTranslateX.value = 0;
		savedTranslateY.value = 0;
	}, [visible, initialIndex]);

	useEffect(() => {
		if (!visible) return;
		const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
			onClose();
			return true;
		});
		return () => subscription.remove();
	}, [visible, onClose]);

	function clampTranslate(value: number, scaleValue: number, axisSize: number) {
		'worklet';
		const max = (axisSize * (scaleValue - 1)) / 2;
		return Math.min(Math.max(value, -max), max);
	}

	function resetZoom() {
		scale.value = 1;
		savedScale.value = 1;
		translateX.value = 0;
		translateY.value = 0;
		savedTranslateX.value = 0;
		savedTranslateY.value = 0;
	}

	const pinchGesture = Gesture.Pinch()
		.onUpdate((e) => {
			scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 5);
		})
		.onEnd(() => {
			savedScale.value = scale.value;
			if (scale.value < 1.05) {
				scale.value = withTiming(1);
				translateX.value = withTiming(0);
				translateY.value = withTiming(0);
				savedTranslateX.value = 0;
				savedTranslateY.value = 0;
				savedScale.value = 1;
				return;
			}
			const clampedX = clampTranslate(translateX.value, scale.value, SCREEN_W);
			const clampedY = clampTranslate(translateY.value, scale.value, SCREEN_H);
			translateX.value = withTiming(clampedX);
			translateY.value = withTiming(clampedY);
			savedTranslateX.value = clampedX;
			savedTranslateY.value = clampedY;
		});

	const panGesture = Gesture.Pan()
		.onUpdate((e) => {
			if (scale.value > 1) {
				translateX.value = clampTranslate(
					savedTranslateX.value + e.translationX,
					scale.value,
					SCREEN_W,
				);
				translateY.value = clampTranslate(
					savedTranslateY.value + e.translationY,
					scale.value,
					SCREEN_H,
				);
			} else if (count > 1) {
				dragX.value = e.translationX;
			}
		})
		.onEnd((e) => {
			if (scale.value > 1) {
				savedTranslateX.value = translateX.value;
				savedTranslateY.value = translateY.value;
				return;
			}
			if (count <= 1) return;

			let nextIndex = currentIndexShared.value;
			if (e.translationX < -SWIPE_THRESHOLD || e.velocityX < -SWIPE_VELOCITY) {
				nextIndex = Math.min(nextIndex + 1, count - 1);
			} else if (e.translationX > SWIPE_THRESHOLD || e.velocityX > SWIPE_VELOCITY) {
				nextIndex = Math.max(nextIndex - 1, 0);
			}

			currentIndexShared.value = nextIndex;
			carouselX.value = withTiming(-nextIndex * SCREEN_W);
			dragX.value = withTiming(0);
			runOnJS(setCurrentIndex)(nextIndex);
			runOnJS(resetZoom)();
		});

	const doubleTapGesture = Gesture.Tap()
		.numberOfTaps(2)
		.onEnd(() => {
			const next = scale.value > 1 ? 1 : 2.5;
			scale.value = withTiming(next);
			savedScale.value = next;
			if (next === 1) {
				translateX.value = withTiming(0);
				translateY.value = withTiming(0);
				savedTranslateX.value = 0;
				savedTranslateY.value = 0;
			}
		});

	// Pan is gated to single-pointer drags so it never fights the pinch's second finger.
	const composedGesture = Gesture.Simultaneous(
		pinchGesture,
		Gesture.Race(doubleTapGesture, panGesture),
	);

	const rowStyle = useAnimatedStyle(() => ({
		flexDirection: 'row',
		width: SCREEN_W * count,
		height: SCREEN_H,
		transform: [{ translateX: carouselX.value + dragX.value }],
	}));

	const zoomStyle = useAnimatedStyle(() => ({
		width: SCREEN_W,
		height: SCREEN_H,
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
	}));

	return (
		<Modal
			visible={visible}
			transparent
			animationType='fade'
			onRequestClose={onClose}
			presentationStyle='overFullScreen'
			statusBarTranslucent
		>
			<GestureHandlerRootView style={styles.container}>
				<GestureDetector gesture={composedGesture}>
					<Animated.View style={rowStyle}>
						{imageUrls.map((uri, i) => (
							<View key={`img-${i}`} style={styles.page}>
								<Animated.View style={i === currentIndex ? zoomStyle : styles.flexFill}>
									<Image
										source={{ uri }}
										style={styles.image}
										contentFit='contain'
										cachePolicy='memory-disk'
									/>
								</Animated.View>
							</View>
						))}
					</Animated.View>
				</GestureDetector>

				<Pressable
					onPress={onClose}
					hitSlop={12}
					style={[styles.closeBtn, { top: insets.top + 8 }]}
				>
					<Ionicons name='close' size={20} color='#fff' />
				</Pressable>

				{count > 1 && (
					<View
						style={[styles.counterWrap, { bottom: insets.bottom + 24 }]}
						pointerEvents='none'
					>
						<View style={styles.counterPill}>
							<Text style={styles.counterText}>
								{currentIndex + 1} / {count}
							</Text>
						</View>
					</View>
				)}
			</GestureHandlerRootView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#000' },
	page: {
		width: SCREEN_W,
		height: SCREEN_H,
	},
	flexFill: { width: SCREEN_W, height: SCREEN_H },
	image: { width: '100%', height: '100%' },
	closeBtn: {
		position: 'absolute',
		right: 10,
		zIndex: 10,
		width: 32,
		height: 32,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: 'rgba(0, 0, 0, 0.55)',
		borderRadius: 16,
	},
	counterWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
	counterPill: {
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
	},
	counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
