import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const WS_URL = API_URL.replace('http', 'ws');

// Cross-platform alert
const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    const { Alert } = require('react-native');
    Alert.alert(title, message);
  }
};

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, token } = useAuth();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef(false);
  const currentUserId = String(user?._id || user?.id || '');

  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    shouldReconnectRef.current = true;
    loadConversation();
    loadMessages();
    connectWebSocket();

    return () => {
      shouldReconnectRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [id]);

  const connectWebSocket = () => {
    if (!token) return;

    try {
      const ws = new WebSocket(`${WS_URL}/api/chat/ws/${token}`);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        if (shouldReconnectRef.current) {
          setTimeout(connectWebSocket, 5000);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('WebSocket connection error:', error);
    }
  };

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case 'new_message':
        if (data.conversation_id === id) {
          setMessages(prev => (
            prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]
          ));
          scrollToBottom();
          if (data.message.sender_id !== currentUserId) {
            markMessageAsRead(data.message.id);
          }
        }
        break;
      
      case 'message_delivered':
        setMessages(prev => prev.map(m => 
          m.id === data.message_id ? { ...m, status: 'delivered', delivered_at: data.delivered_at } : m
        ));
        break;
      
      case 'message_read':
        setMessages(prev => prev.map(m => 
          m.id === data.message_id ? { ...m, status: 'read', read_at: data.read_at } : m
        ));
        break;
      
      case 'typing':
        if (data.conversation_id === id) {
          setOtherUserTyping(true);
        }
        break;
      
      case 'stop_typing':
        if (data.conversation_id === id) {
          setOtherUserTyping(false);
        }
        break;
      
      case 'pong':
        // Keep-alive response
        break;
    }
  };

  const loadConversation = async () => {
    try {
      const response = await api.get(`/chat/conversations/${id}`);
      setConversation(response.data);
    } catch (error) {
      console.error('Error loading conversation:', error);
      showAlert('Error', 'Failed to load conversation');
      router.back();
    }
  };

  const loadMessages = async () => {
    try {
      const response = await api.get(`/chat/conversations/${id}/messages`);
      setMessages(response.data);
      scrollToBottom();
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markMessageAsRead = async (messageId: string) => {
    try {
      await api.patch(`/chat/messages/${messageId}/status`, null, {
        params: { status: 'read' }
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const response = await api.post(`/chat/conversations/${id}/messages`, {
        content: newMessage.trim(),
        message_type: 'text'
      });

      setMessages(prev => [...prev, response.data]);
      setNewMessage('');
      scrollToBottom();
      
      // Stop typing indicator
      sendTypingIndicator(false);
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const sendTypingIndicator = (typing: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: typing ? 'typing' : 'stop_typing',
        conversation_id: id
      }));
    }
  };

  const handleInputChange = (text: string) => {
    setNewMessage(text);

    // Send typing indicator
    if (!isTyping) {
      setIsTyping(true);
      sendTypingIndicator(true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendTypingIndicator(false);
    }, 2000);
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadFile(result.assets[0].uri, 'image');
      }
    } catch (error) {
      console.error('Image picker error:', error);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadFile(result.assets[0].uri, 'document', result.assets[0].name);
      }
    } catch (error) {
      console.error('Document picker error:', error);
    }
  };

  const uploadFile = async (uri: string, type: 'image' | 'document', filename?: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      
      // Get file info
      const uriParts = uri.split('.');
      const fileExtension = uriParts[uriParts.length - 1];
      const name = filename || `file_${Date.now()}.${fileExtension}`;
      
      formData.append('file', {
        uri,
        name,
        type: type === 'image' ? `image/${fileExtension}` : 'application/octet-stream',
      } as any);

      const uploadResponse = await api.post('/chat/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Send message with file
      const response = await api.post(`/chat/conversations/${id}/messages`, {
        content: type === 'image' ? '📷 Image' : `📄 ${name}`,
        message_type: type,
        file_url: uploadResponse.data.file_url,
        file_name: uploadResponse.data.file_name,
        file_size: uploadResponse.data.file_size,
      });

      setMessages(prev => [...prev, response.data]);
      scrollToBottom();
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const openFile = (fileUrl: string) => {
    const fullUrl = `${API_URL}${fileUrl}`;
    Linking.openURL(fullUrl);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    }
  };

  const getMessageStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <Ionicons name="checkmark" size={14} color={COLORS.textTertiary} />;
      case 'delivered':
        return <Ionicons name="checkmark-done" size={14} color={COLORS.textTertiary} />;
      case 'read':
        return <Ionicons name="checkmark-done" size={14} color={COLORS.info} />;
      default:
        return null;
    }
  };

  const renderMessage = (message: any, index: number) => {
    const isOwn = message.sender_id === currentUserId;
    const showDate = index === 0 || 
      formatDate(messages[index - 1]?.created_at) !== formatDate(message.created_at);

    return (
      <View key={message.id}>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateText}>{formatDate(message.created_at)}</Text>
          </View>
        )}
        
        <View style={[styles.messageContainer, isOwn ? styles.ownMessage : styles.otherMessage]}>
          <View style={[styles.messageBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
            {!isOwn && (
              <Text style={styles.senderName}>{message.sender_name}</Text>
            )}
            
            {message.message_type === 'image' && message.file_url && (
              <TouchableOpacity onPress={() => openFile(message.file_url)}>
                <Image
                  source={{ uri: `${API_URL}${message.file_url}` }}
                  style={styles.messageImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}
            
            {message.message_type === 'document' && message.file_url && (
              <TouchableOpacity 
                style={styles.documentContainer}
                onPress={() => openFile(message.file_url)}
              >
                <Ionicons name="document" size={24} color={COLORS.gold} />
                <View style={styles.documentInfo}>
                  <Text style={styles.documentName} numberOfLines={1}>
                    {message.file_name || 'Document'}
                  </Text>
                  {message.file_size && (
                    <Text style={styles.documentSize}>
                      {(message.file_size / 1024).toFixed(1)} KB
                    </Text>
                  )}
                </View>
                <Ionicons name="download" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
            
            <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
              {message.content}
            </Text>
            
            <View style={styles.messageFooter}>
              <Text style={styles.messageTime}>{formatTime(message.created_at)}</Text>
              {isOwn && getMessageStatusIcon(message.status)}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const getOtherParticipant = () => {
    if (!conversation) return null;
    const otherId = conversation.participants?.find((p: string) => p !== currentUserId);
    const role = conversation.participant_roles?.[otherId];
    return {
      name: role === 'super_admin' ? 'Chat with Admin' : conversation.participant_names?.[otherId] || 'Unknown',
      role
    };
  };

  const otherParticipant = getOtherParticipant();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{otherParticipant?.name}</Text>
          <Text style={styles.headerRole}>{otherParticipant?.role?.replace('_', ' ')}</Text>
        </View>
        
        {/* Future: Video call button */}
        <TouchableOpacity style={styles.videoButton} disabled>
          <Ionicons name="videocam" size={24} color={COLORS.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={scrollToBottom}
      >
        {messages.map((message, index) => renderMessage(message, index))}
        
        {otherUserTyping && (
          <View style={[styles.messageContainer, styles.otherMessage]}>
            <View style={[styles.messageBubble, styles.otherBubble, styles.typingBubble]}>
              <View style={styles.typingIndicator}>
                <View style={[styles.typingDot, styles.typingDot1]} />
                <View style={[styles.typingDot, styles.typingDot2]} />
                <View style={[styles.typingDot, styles.typingDot3]} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input Area */}
      <View style={styles.inputContainer}>
        {uploading && (
          <View style={styles.uploadingBar}>
            <ActivityIndicator size="small" color={COLORS.gold} />
            <Text style={styles.uploadingText}>Uploading...</Text>
          </View>
        )}
        
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.attachButton} onPress={pickImage}>
            <Ionicons name="image" size={24} color={COLORS.gold} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.attachButton} onPress={pickDocument}>
            <Ionicons name="document-attach" size={24} color={COLORS.gold} />
          </TouchableOpacity>
          
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.textTertiary}
            value={newMessage}
            onChangeText={handleInputChange}
            multiline
            maxLength={1000}
          />
          
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={COLORS.marbleDark} />
            ) : (
              <Ionicons name="send" size={20} color={COLORS.marbleDark} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
    backgroundColor: COLORS.marbleDark,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.marbleGray,
  },
  backButton: {
    padding: SIZES.sm,
    marginRight: SIZES.sm,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  headerRole: {
    fontSize: SIZES.fontSm,
    color: COLORS.gold,
    textTransform: 'capitalize',
  },
  videoButton: {
    padding: SIZES.sm,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: SIZES.md,
    paddingBottom: SIZES.xl,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: SIZES.md,
  },
  dateText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textTertiary,
    backgroundColor: COLORS.backgroundCard,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.xs,
    borderRadius: SIZES.radiusFull,
  },
  messageContainer: {
    marginBottom: SIZES.sm,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
  },
  ownBubble: {
    backgroundColor: COLORS.gold,
    borderBottomRightRadius: SIZES.xs,
  },
  otherBubble: {
    backgroundColor: COLORS.backgroundCard,
    borderBottomLeftRadius: SIZES.xs,
  },
  senderName: {
    fontSize: SIZES.fontXs,
    fontWeight: '600',
    color: COLORS.gold,
    marginBottom: SIZES.xs,
  },
  messageText: {
    fontSize: SIZES.fontMd,
    lineHeight: 22,
  },
  ownText: {
    color: COLORS.marbleDark,
  },
  otherText: {
    color: COLORS.textPrimary,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: SIZES.xs,
    gap: 4,
  },
  messageTime: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: SIZES.radiusSm,
    marginBottom: SIZES.sm,
  },
  documentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.sm,
    borderRadius: SIZES.radiusSm,
    marginBottom: SIZES.sm,
    gap: SIZES.sm,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  documentSize: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
  },
  typingBubble: {
    padding: SIZES.md,
  },
  typingIndicator: {
    flexDirection: 'row',
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.textTertiary,
  },
  typingDot1: {
    opacity: 0.4,
  },
  typingDot2: {
    opacity: 0.7,
  },
  typingDot3: {
    opacity: 1,
  },
  inputContainer: {
    backgroundColor: COLORS.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.marbleGray,
    paddingBottom: Platform.OS === 'ios' ? 30 : SIZES.md,
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SIZES.sm,
    backgroundColor: COLORS.gold + '20',
    gap: SIZES.sm,
  },
  uploadingText: {
    fontSize: SIZES.fontSm,
    color: COLORS.gold,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SIZES.sm,
    paddingTop: SIZES.sm,
    gap: SIZES.sm,
  },
  attachButton: {
    padding: SIZES.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
    maxHeight: 100,
    minHeight: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
