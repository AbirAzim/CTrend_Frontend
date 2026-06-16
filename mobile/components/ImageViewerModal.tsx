import { Image } from 'expo-image';
import { useState } from 'react';
import {
	Dimensions,
	Modal,
	Pressable,
	Text,
	View,
	FlatList,
	NativeScrollEvent,
	NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface ImageViewerModalProps {
	visible: boolean;
	imageUrls: string[];
	initialIndex?: number;
	onClose: () => void;
}

/**
 * Full-screen image viewer modal with carousel support for multiple images.
 * Shows images at their natural aspect ratio without cropping.
 */
export function ImageViewerModal({
	visible,
	imageUrls,
	initialIndex = 0,
	onClose,
}: ImageViewerModalProps) {
	const [currentIndex, setCurrentIndex] = useState(initialIndex);

	const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
		const contentOffsetX = event.nativeEvent.contentOffset.x;
		const currentIndex = Math.round(contentOffsetX / SCREEN_W);
		setCurrentIndex(currentIndex);
	};

	return (
		<Modal visible={visible} transparent animationType='fade'>
			<View style={{ flex: 1, backgroundColor: '#000' }}>
				{/* Close Button */}
				<Pressable
					onPress={onClose}
					style={{
						position: 'absolute',
						top: 50,
						right: 16,
						zIndex: 10,
						width: 44,
						height: 44,
						justifyContent: 'center',
						alignItems: 'center',
						backgroundColor: 'rgba(255, 255, 255, 0.2)',
						borderRadius: 22,
					}}
				>
					<Ionicons name='close' size={28} color='#fff' />
				</Pressable>

				{/* Image Carousel */}
				<FlatList
					data={imageUrls}
					horizontal
					pagingEnabled
					scrollEventThrottle={16}
					onScroll={handleScroll}
					keyExtractor={(_, i) => `img-${i}`}
					renderItem={({ item }) => (
						<View
							style={{
								width: SCREEN_W,
								height: SCREEN_H,
								justifyContent: 'center',
								alignItems: 'center',
							}}
						>
							<Image
								source={{ uri: item }}
								style={{
									width: '100%',
									height: '100%',
								}}
								contentFit='contain'
								cachePolicy='memory-disk'
							/>
						</View>
					)}
				/>

				{/* Image Counter */}
				{imageUrls.length > 1 && (
					<View
						style={{
							position: 'absolute',
							bottom: 24,
							left: 0,
							right: 0,
							alignItems: 'center',
						}}
					>
						<Text style={{ color: '#fff', fontSize: 16 }}>
							{currentIndex + 1} / {imageUrls.length}
						</Text>
					</View>
				)}
			</View>
		</Modal>
	);
}
