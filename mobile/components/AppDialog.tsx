import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

export type DialogAction = {
	label: string;
	onPress: () => void;
	destructive?: boolean;
	cancel?: boolean;
};

type ActionSheetProps = {
	visible: boolean;
	title?: string;
	message?: string;
	actions: DialogAction[];
	onClose: () => void;
	/** When true, renders as a centered card instead of a bottom sheet. */
	centered?: boolean;
};

/** Bottom sheet action picker — replaces native Alert.alert option lists. */
export function AppActionSheet({
	visible,
	title,
	message,
	actions,
	onClose,
	centered = false,
}: ActionSheetProps) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();

	if (centered) {
		return (
			<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
				<View style={styles.centeredRoot}>
					<Pressable style={styles.overlay} onPress={onClose} />
					<View style={[styles.centeredCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
						{title ? (
							<Text style={[styles.centeredTitle, { color: colors.text }]}>{title}</Text>
						) : null}
						{message ? (
							<Text style={[styles.message, { color: colors.subtext }]}>{message}</Text>
						) : null}
						{actions.map((action, i) => (
							<Pressable
								key={`${action.label}-${i}`}
								style={[
									styles.centeredRow,
									i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
									action.cancel && [styles.centeredCancelRow, { borderTopWidth: 1, borderTopColor: colors.border }],
								]}
								onPress={() => {
									onClose();
									action.onPress();
								}}
							>
								<Text
									style={[
										styles.centeredRowText,
										action.destructive && styles.destructiveText,
										action.cancel && { color: colors.muted, fontSize: 15, fontWeight: "600" },
										!action.destructive && !action.cancel && { color: colors.accent },
									]}
								>
									{action.label}
								</Text>
							</Pressable>
						))}
					</View>
				</View>
			</Modal>
		);
	}

	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<View style={styles.root}>
				<Pressable style={styles.overlay} onPress={onClose} />
				<View
					style={[
						styles.sheet,
						{
							backgroundColor: colors.card,
							borderColor: colors.border,
							paddingBottom: Math.max(insets.bottom, 16),
						},
					]}
				>
					<View style={[styles.handle, { backgroundColor: colors.border }]} />
					{title ? (
						<Text style={[styles.title, { color: colors.text }]}>{title}</Text>
					) : null}
					{message ? (
						<Text style={[styles.message, { color: colors.subtext }]}>{message}</Text>
					) : null}
					{actions.map((action, i) => (
						<Pressable
							key={`${action.label}-${i}`}
							style={[
								styles.row,
								i > 0 && {
									borderTopWidth: StyleSheet.hairlineWidth,
									borderTopColor: colors.border,
								},
							]}
							onPress={() => {
								onClose();
								action.onPress();
							}}
						>
							<Text
								style={[
									styles.rowText,
									action.destructive && styles.destructiveText,
									action.cancel && { color: colors.subtext, fontWeight: "600" },
									!action.destructive && !action.cancel && { color: colors.accent },
								]}
							>
								{action.label}
							</Text>
						</Pressable>
					))}
				</View>
			</View>
		</Modal>
	);
}

type ConfirmProps = {
	visible: boolean;
	title: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
};

/** Themed confirm dialog — replaces native Alert.alert yes/no prompts. */
export function AppConfirmDialog({
	visible,
	title,
	message,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	destructive = false,
	onConfirm,
	onCancel,
}: ConfirmProps) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
			<View style={[styles.confirmRoot, { paddingBottom: insets.bottom + 24 }]}>
				<Pressable style={styles.overlay} onPress={onCancel} />
				<View
					style={[
						styles.confirmCard,
						{ backgroundColor: colors.card, borderColor: colors.border },
					]}
				>
					<Text style={[styles.confirmTitle, { color: colors.text }]}>{title}</Text>
					{message ? (
						<Text style={[styles.confirmMessage, { color: colors.subtext }]}>{message}</Text>
					) : null}
					<View style={styles.confirmActions}>
						<Pressable
							style={[styles.confirmBtn, { borderColor: colors.border }]}
							onPress={onCancel}
						>
							<Text style={[styles.confirmBtnText, { color: colors.subtext }]}>
								{cancelLabel}
							</Text>
						</Pressable>
						<Pressable
							style={[
								styles.confirmBtn,
								destructive
									? styles.confirmBtnDestructive
									: { backgroundColor: colors.accent },
							]}
							onPress={() => {
								onCancel();
								onConfirm();
							}}
						>
							<Text
								style={[
									styles.confirmBtnText,
									{ color: destructive ? "#fff" : "#fff", fontWeight: "800" },
								]}
							>
								{confirmLabel}
							</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, justifyContent: "flex-end" },
	centeredRoot: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
	},
	centeredCard: {
		width: "100%",
		maxWidth: 320,
		borderRadius: 20,
		borderWidth: 1,
		overflow: "hidden",
	},
	centeredTitle: {
		fontSize: 15,
		fontWeight: "800",
		textAlign: "center",
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 14,
		letterSpacing: -0.2,
	},
	centeredRow: {
		paddingVertical: 16,
		paddingHorizontal: 20,
	},
	centeredCancelRow: {
		paddingVertical: 14,
		paddingHorizontal: 20,
		marginTop: 4,
	},
	centeredRowText: {
		fontSize: 16,
		fontWeight: "700",
		textAlign: "center",
	},
	confirmRoot: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 28,
	},
	overlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0,0,0,0.55)",
	},
	sheet: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: 1,
		paddingTop: 10,
	},
	handle: {
		width: 36,
		height: 4,
		borderRadius: 2,
		alignSelf: "center",
		marginBottom: 12,
	},
	title: {
		fontSize: 17,
		fontWeight: "800",
		paddingHorizontal: 20,
		marginBottom: 4,
	},
	message: {
		fontSize: 14,
		lineHeight: 20,
		paddingHorizontal: 20,
		marginBottom: 8,
	},
	row: { paddingVertical: 16, paddingHorizontal: 20 },
	rowText: { fontSize: 16, fontWeight: "700", textAlign: "center" },
	destructiveText: { color: "#f02849" },
	confirmCard: {
		width: "100%",
		maxWidth: 340,
		borderRadius: 16,
		borderWidth: 1,
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 16,
	},
	confirmTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
	confirmMessage: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
	confirmActions: { flexDirection: "row", gap: 10 },
	confirmBtn: {
		flex: 1,
		paddingVertical: 12,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
	},
	confirmBtnDestructive: { backgroundColor: "#f02849", borderColor: "#f02849" },
	confirmBtnText: { fontSize: 15, fontWeight: "700" },
});
