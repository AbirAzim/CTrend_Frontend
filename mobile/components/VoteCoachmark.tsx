import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

/**
 * First-run "how to vote" coach mark.
 *
 * A non-interactive overlay (pointerEvents="none", so real taps still vote)
 * that demonstrates the tap-to-vote gesture: a fingertip "presses" one side,
 * an expanding ripple fires, then it glides to the other side and presses
 * again — teaching new users that the photos themselves are the vote buttons.
 *
 * Auto-dismisses after a few loops via `onDone`. Sized to whatever media
 * container it's dropped into (absolute-fills its parent).
 */

const TOUCH = 56;
const DISMISS_AFTER_MS = 7200;

export function VoteCoachmark({
	onDone,
	label = 'Tap a photo to vote',
}: {
	onDone?: () => void;
	label?: string;
}) {
	const [w, setW] = useState(0);
	const fade = useRef(new Animated.Value(0)).current; // overlay in/out
	const slide = useRef(new Animated.Value(0)).current; // 0 = left, 1 = right
	const press = useRef(new Animated.Value(0)).current; // fingertip press depth
	const ripple = useRef(new Animated.Value(0)).current; // tap ripple expansion
	const bob = useRef(new Animated.Value(0)).current; // tooltip idle bob

	useEffect(() => {
		Animated.timing(fade, {
			toValue: 1,
			duration: 360,
			useNativeDriver: true,
		}).start();

		// One "tap": quick press dip + a ripple that expands and fades out.
		const tap = () =>
			Animated.parallel([
				Animated.sequence([
					Animated.timing(press, {
						toValue: 1,
						duration: 120,
						easing: Easing.out(Easing.quad),
						useNativeDriver: true,
					}),
					Animated.timing(press, {
						toValue: 0,
						duration: 240,
						easing: Easing.out(Easing.quad),
						useNativeDriver: true,
					}),
				]),
				Animated.sequence([
					Animated.timing(ripple, {
						toValue: 0,
						duration: 0,
						useNativeDriver: true,
					}),
					Animated.timing(ripple, {
						toValue: 1,
						duration: 560,
						easing: Easing.out(Easing.quad),
						useNativeDriver: true,
					}),
				]),
			]);

		const glide = (to: number) =>
			Animated.timing(slide, {
				toValue: to,
				duration: 520,
				easing: Easing.inOut(Easing.cubic),
				useNativeDriver: true,
			});

		const loop = Animated.loop(
			Animated.sequence([
				tap(),
				Animated.delay(280),
				glide(1),
				tap(),
				Animated.delay(280),
				glide(0),
			]),
		);
		loop.start();

		const bobLoop = Animated.loop(
			Animated.sequence([
				Animated.timing(bob, {
					toValue: 1,
					duration: 900,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
				Animated.timing(bob, {
					toValue: 0,
					duration: 900,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
			]),
		);
		bobLoop.start();

		const t = setTimeout(() => {
			Animated.timing(fade, {
				toValue: 0,
				duration: 320,
				useNativeDriver: true,
			}).start(() => onDone?.());
		}, DISMISS_AFTER_MS);

		return () => {
			loop.stop();
			bobLoop.stop();
			clearTimeout(t);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const translateX = slide.interpolate({
		inputRange: [0, 1],
		outputRange: [w * 0.27 - TOUCH / 2, w * 0.73 - TOUCH / 2],
	});

	return (
		<Animated.View
			pointerEvents='none'
			onLayout={(e) => setW(e.nativeEvent.layout.width)}
			style={[styles.root, { opacity: fade }]}>
			{/* Focus scrim — very light so the photos stay readable */}
			<View style={styles.scrim} />

			{/* Tooltip pill */}
			<Animated.View
				style={[
					styles.tipWrap,
					{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
				]}>
				<View style={styles.tip}>
					<Text style={styles.tipFinger}>👆</Text>
					<Text style={styles.tipText}>{label}</Text>
				</View>
			</Animated.View>

			{/* Animated fingertip + ripple */}
			{w > 0 ? (
				<Animated.View style={[styles.touchLayer, { transform: [{ translateX }] }]}>
					<Animated.View
						style={[
							styles.ripple,
							{
								opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
								transform: [
									{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.8] }) },
								],
							},
						]}
					/>
					<Animated.View
						style={[
							styles.touch,
							{
								transform: [
									{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }) },
								],
							},
						]}
					/>
				</Animated.View>
			) : null}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	root: { ...StyleSheet.absoluteFill, zIndex: 20 },
	scrim: {
		...StyleSheet.absoluteFill,
		backgroundColor: 'rgba(0,0,0,0.16)',
	},
	tipWrap: {
		position: 'absolute',
		top: 16,
		left: 0,
		right: 0,
		alignItems: 'center',
	},
	tip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 7,
		paddingHorizontal: 14,
		paddingVertical: 9,
		borderRadius: 999,
		backgroundColor: 'rgba(17,17,19,0.86)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.16)',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 6,
	},
	tipFinger: { fontSize: 15 },
	tipText: {
		color: '#ffffff',
		fontSize: 13.5,
		fontWeight: '800',
		letterSpacing: 0.2,
	},
	touchLayer: {
		position: 'absolute',
		top: '46%',
		left: 0,
		width: TOUCH,
		height: TOUCH,
		alignItems: 'center',
		justifyContent: 'center',
	},
	ripple: {
		position: 'absolute',
		width: TOUCH,
		height: TOUCH,
		borderRadius: TOUCH / 2,
		borderWidth: 3,
		borderColor: 'rgba(255,255,255,0.95)',
	},
	touch: {
		width: TOUCH * 0.62,
		height: TOUCH * 0.62,
		borderRadius: (TOUCH * 0.62) / 2,
		backgroundColor: 'rgba(255,255,255,0.92)',
		borderWidth: 2,
		borderColor: 'rgba(255,255,255,0.6)',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.35,
		shadowRadius: 6,
		elevation: 5,
	},
});
