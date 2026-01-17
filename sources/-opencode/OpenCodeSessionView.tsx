import { layout } from '@/components/layout';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { Typography } from '@/constants/Typography';
import { Modal } from '@/modal';
import { FusionClient } from '@/sync/fusion';
import { getFusionServerUrl, getOpenCodePassword } from '@/sync/serverConfig';
import type { Theme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
	ActivityIndicator,
	FlatList,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	Text,
	TextInput,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

interface OpenCodeMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
	isStreaming?: boolean;
}

interface OpenCodeSessionViewProps {
	fusionSessionId: string;
	sandboxIp: string;
	openCodeSessionId: string;
}

export const OpenCodeSessionView = React.memo((props: OpenCodeSessionViewProps) => {
	const { fusionSessionId, sandboxIp, openCodeSessionId } = props;
	const { theme } = useUnistyles();
	const router = useRouter();
	const safeArea = useSafeAreaInsets();

	const [messages, setMessages] = React.useState<OpenCodeMessage[]>([]);
	const [inputText, setInputText] = React.useState('');
	const [isLoading, setIsLoading] = React.useState(false);
	const [isTerminating, setIsTerminating] = React.useState(false);
	const [sessionStatus, setSessionStatus] = React.useState<'active' | 'terminated' | 'error'>(
		'active',
	);

	const flatListRef = React.useRef<FlatList>(null);

	const client = React.useMemo(() => {
		return new FusionClient({
			apiUrl: getFusionServerUrl(),
			openCodePassword: getOpenCodePassword(),
		});
	}, []);

	const handleSendMessage = React.useCallback(async () => {
		if (!inputText.trim() || isLoading) return;

		const userMessage: OpenCodeMessage = {
			id: `user-${Date.now()}`,
			role: 'user',
			content: inputText.trim(),
			timestamp: Date.now(),
		};

		const assistantMessage: OpenCodeMessage = {
			id: `assistant-${Date.now()}`,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			isStreaming: true,
		};

		setMessages((prev: OpenCodeMessage[]) => [assistantMessage, userMessage, ...prev]);
		setInputText('');
		setIsLoading(true);

		try {
			await client.sendOpenCodeMessage(
				sandboxIp,
				openCodeSessionId,
				userMessage.content,
				(chunk: string) => {
					try {
						const data = JSON.parse(chunk);
						if (data.type === 'text' && data.content) {
							setMessages((prev: OpenCodeMessage[]) => {
								const updated = [...prev];
								const assistantIdx = updated.findIndex((m) => m.id === assistantMessage.id);
								if (assistantIdx !== -1) {
									updated[assistantIdx] = {
										...updated[assistantIdx],
										content: updated[assistantIdx].content + data.content,
									};
								}
								return updated;
							});
						}
					} catch {
						setMessages((prev: OpenCodeMessage[]) => {
							const updated = [...prev];
							const assistantIdx = updated.findIndex((m) => m.id === assistantMessage.id);
							if (assistantIdx !== -1) {
								updated[assistantIdx] = {
									...updated[assistantIdx],
									content: updated[assistantIdx].content + chunk,
								};
							}
							return updated;
						});
					}
				},
			);
		} catch (error) {
			console.error('Failed to send message:', error);
			setMessages((prev: OpenCodeMessage[]) => {
				const updated = [...prev];
				const assistantIdx = updated.findIndex((m) => m.id === assistantMessage.id);
				if (assistantIdx !== -1) {
					updated[assistantIdx] = {
						...updated[assistantIdx],
						content: 'Error: Failed to get response from OpenCode',
						isStreaming: false,
					};
				}
				return updated;
			});
		} finally {
			setIsLoading(false);
			setMessages((prev: OpenCodeMessage[]) => {
				const updated = [...prev];
				const assistantIdx = updated.findIndex((m) => m.id === assistantMessage.id);
				if (assistantIdx !== -1) {
					updated[assistantIdx] = {
						...updated[assistantIdx],
						isStreaming: false,
					};
				}
				return updated;
			});
		}
	}, [inputText, isLoading, client, sandboxIp, openCodeSessionId]);

	const handleTerminateSession = React.useCallback(async () => {
		Modal.alert(
			'Terminate Session',
			'This will stop the cloud instance and delete all session data. Are you sure?',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Terminate',
					style: 'destructive',
					onPress: async () => {
						setIsTerminating(true);
						try {
							await client.deleteSession(fusionSessionId);
							setSessionStatus('terminated');
							router.back();
						} catch (error) {
							console.error('Failed to terminate session:', error);
							Modal.alert('Error', 'Failed to terminate session. Please try again.');
						} finally {
							setIsTerminating(false);
						}
					},
				},
			],
		);
	}, [client, fusionSessionId, router]);

	const renderMessage = React.useCallback(
		({ item }: { item: OpenCodeMessage }) => {
			if (item.role === 'user') {
				return (
					<View style={styles.userMessageContainer}>
						<View
							style={[
								styles.userMessageBubble,
								{ backgroundColor: theme.colors.button.primary.background },
							]}
						>
							<Text style={[styles.userMessageText, { color: theme.colors.button.primary.tint }]}>
								{item.content}
							</Text>
						</View>
					</View>
				);
			}

			return (
				<View style={styles.assistantMessageContainer}>
					{item.content ? (
						<MarkdownView markdown={item.content} />
					) : item.isStreaming ? (
						<ActivityIndicator size="small" color={theme.colors.textSecondary} />
					) : null}
				</View>
			);
		},
		[theme],
	);

	const keyExtractor = React.useCallback((item: OpenCodeMessage) => item.id, []);

	return (
		<View style={[styles.container, { backgroundColor: theme.colors.background }]}>
			<View
				style={[styles.header, { paddingTop: safeArea.top, backgroundColor: theme.colors.surface }]}
			>
				<Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={15}>
					<Ionicons
						name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
						size={24}
						color={theme.colors.text}
					/>
				</Pressable>
				<View style={styles.headerTitleContainer}>
					<Text style={[styles.headerTitle, { color: theme.colors.text }]}>OpenCode</Text>
					<View style={styles.statusContainer}>
						<View
							style={[
								styles.statusDot,
								{ backgroundColor: sessionStatus === 'active' ? '#34C759' : '#FF3B30' },
							]}
						/>
						<Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
							{sessionStatus === 'active' ? 'Cloud Instance Active' : 'Terminated'}
						</Text>
					</View>
				</View>
				<Pressable
					onPress={handleTerminateSession}
					style={[styles.terminateButton, { backgroundColor: theme.colors.textDestructive + '20' }]}
					disabled={isTerminating || sessionStatus !== 'active'}
					hitSlop={10}
				>
					{isTerminating ? (
						<ActivityIndicator size="small" color={theme.colors.textDestructive} />
					) : (
						<Ionicons name="power" size={20} color={theme.colors.textDestructive} />
					)}
				</Pressable>
			</View>

			<FlatList
				ref={flatListRef}
				data={messages}
				renderItem={renderMessage}
				keyExtractor={keyExtractor}
				inverted
				style={styles.messageList}
				contentContainerStyle={[styles.messageListContent, { paddingBottom: 16 }]}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
				ListEmptyComponent={
					<View style={styles.emptyContainer}>
						<Ionicons name="cloud-outline" size={48} color={theme.colors.textSecondary} />
						<Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
							Cloud Coding Session
						</Text>
						<Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
							Send a message to start coding with OpenCode
						</Text>
					</View>
				}
			/>

			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
				keyboardVerticalOffset={0}
			>
				<View
					style={[
						styles.inputContainer,
						{ backgroundColor: theme.colors.surface, paddingBottom: safeArea.bottom + 8 },
					]}
				>
					<View style={[styles.inputWrapper, { backgroundColor: theme.colors.input.background }]}>
						<TextInput
							style={[styles.textInput, { color: theme.colors.text }]}
							placeholder="Message OpenCode..."
							placeholderTextColor={theme.colors.textSecondary}
							value={inputText}
							onChangeText={setInputText}
							multiline
							maxLength={10000}
							editable={sessionStatus === 'active'}
							onSubmitEditing={handleSendMessage}
							blurOnSubmit={false}
						/>
						<Pressable
							onPress={handleSendMessage}
							disabled={!inputText.trim() || isLoading || sessionStatus !== 'active'}
							style={[
								styles.sendButton,
								{
									backgroundColor:
										inputText.trim() && !isLoading
											? theme.colors.button.primary.background
											: theme.colors.button.disabled.background,
								},
							]}
						>
							{isLoading ? (
								<ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
							) : (
								<Ionicons
									name="arrow-up"
									size={20}
									color={
										inputText.trim()
											? theme.colors.button.primary.tint
											: theme.colors.button.disabled.tint
									}
								/>
							)}
						</Pressable>
					</View>
				</View>
			</KeyboardAvoidingView>
		</View>
	);
});

const styles = StyleSheet.create((theme: Theme) => ({
	container: {
		flex: 1,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: theme.colors.divider,
	},
	backButton: {
		width: 40,
		height: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	headerTitleContainer: {
		flex: 1,
		marginLeft: 8,
	},
	headerTitle: {
		fontSize: 17,
		fontWeight: '600',
		...Typography.default('semiBold'),
	},
	statusContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 2,
	},
	statusDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		marginRight: 6,
	},
	statusText: {
		fontSize: 12,
		...Typography.default(),
	},
	terminateButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
	},
	messageList: {
		flex: 1,
	},
	messageListContent: {
		paddingHorizontal: 16,
		maxWidth: layout.maxWidth,
		width: '100%',
		alignSelf: 'center',
	},
	userMessageContainer: {
		alignItems: 'flex-end',
		marginVertical: 8,
	},
	userMessageBubble: {
		maxWidth: '85%',
		borderRadius: 16,
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	userMessageText: {
		fontSize: 15,
		lineHeight: 20,
		...Typography.default(),
	},
	assistantMessageContainer: {
		marginVertical: 8,
		paddingRight: 32,
	},
	emptyContainer: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 64,
		transform: [{ scaleY: -1 }],
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: '600',
		marginTop: 16,
		...Typography.default('semiBold'),
	},
	emptySubtitle: {
		fontSize: 15,
		marginTop: 8,
		textAlign: 'center',
		paddingHorizontal: 32,
		...Typography.default(),
	},
	inputContainer: {
		paddingHorizontal: 16,
		paddingTop: 8,
		borderTopWidth: 1,
		borderTopColor: theme.colors.divider,
	},
	inputWrapper: {
		flexDirection: 'row',
		alignItems: 'flex-end',
		borderRadius: 20,
		paddingLeft: 16,
		paddingRight: 4,
		paddingVertical: 4,
		minHeight: 44,
	},
	textInput: {
		flex: 1,
		fontSize: 16,
		maxHeight: 120,
		paddingVertical: 8,
		...Typography.default(),
	},
	sendButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
	},
}));
