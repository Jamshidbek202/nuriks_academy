import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';

interface Certificate {
  id: string;
  certificate_id: string;
  student_id: string;
  course_id: string;
  certificate_type: string;
  issue_date: string;
  certificate_file?: string;
}

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
}

interface Course {
  id: string;
  name: string;
}

export default function CertificatesScreen() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    student_id: '',
    course_id: '',
    certificate_type: 'completion',
  });

  const isAdmin = user?.role === 'super_admin' || user?.role === 'manager';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [studentsRes, coursesRes] = await Promise.all([
        api.get('/students'),
        api.get('/courses'),
      ]);
      setStudents(studentsRes.data);
      setCourses(coursesRes.data);
      
      // Load certificates for all students (admin) or specific student
      if (isAdmin) {
        const allCerts: Certificate[] = [];
        for (const student of studentsRes.data.slice(0, 20)) {
          try {
            const certsRes = await api.get(`/certificates/student/${student.id}`);
            allCerts.push(...certsRes.data);
          } catch (e) {
            // Student may not have certificates
          }
        }
        setCertificates(allCerts);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateCertificate = async () => {
    if (!formData.student_id || !formData.course_id) {
      Alert.alert('Error', 'Please select student and course');
      return;
    }

    try {
      await api.post('/certificates', {
        student_id: formData.student_id,
        course_id: formData.course_id,
        certificate_type: formData.certificate_type,
      });
      Alert.alert('Success', 'Certificate created successfully');
      setModalVisible(false);
      resetForm();
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create certificate');
    }
  };

  const handleDownloadCertificate = async (certificate: Certificate) => {
    setDownloading(certificate.id);
    try {
      // Get the certificate PDF
      const response = await api.get(`/certificates/download/${certificate.id}`, {
        responseType: 'blob',
      });

      if (Platform.OS === 'web') {
        // Web: Create blob URL and trigger download
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `certificate_${certificate.certificate_id}.pdf`;
        link.click();
        window.URL.revokeObjectURL(url);
        Alert.alert('Success', 'Certificate downloaded');
      } else {
        // Mobile: Save to file system and share
        const base64 = certificate.certificate_file;
        if (base64) {
          const fileUri = FileSystem.documentDirectory + `certificate_${certificate.certificate_id}.pdf`;
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await Sharing.shareAsync(fileUri);
        }
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download certificate');
    } finally {
      setDownloading(null);
    }
  };

  const resetForm = () => {
    setFormData({
      student_id: '',
      course_id: '',
      certificate_type: 'completion',
    });
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown';
  };

  const getCourseName = (courseId: string) => {
    const course = courses.find(c => c.id === courseId);
    return course ? course.name : 'Unknown';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Certificates</Text>
          <Text style={styles.headerSubtitle}>Course completion certificates</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity style={styles.addButton} onPress={() => { resetForm(); setModalVisible(true); }}>
            <Ionicons name="add" size={24} color={COLORS.marbleDark} />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="ribbon" size={32} color={COLORS.gold} />
          <Text style={styles.statValue}>{certificates.length}</Text>
          <Text style={styles.statLabel}>Total Certificates</Text>
        </View>
      </View>

      {/* Certificates List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.gold} />
        }
      >
        {certificates.length > 0 ? (
          certificates.map((cert) => (
            <View key={cert.id} style={styles.certificateCard}>
              <View style={styles.certificateHeader}>
                <View style={styles.certificateIcon}>
                  <Ionicons name="ribbon" size={32} color={COLORS.gold} />
                </View>
                <View style={styles.certificateInfo}>
                  <Text style={styles.certificateStudent}>{getStudentName(cert.student_id)}</Text>
                  <Text style={styles.certificateCourse}>{getCourseName(cert.course_id)}</Text>
                  <Text style={styles.certificateDate}>Issued: {formatDate(cert.issue_date)}</Text>
                </View>
              </View>

              <View style={styles.certificateMeta}>
                <View style={styles.certIdBadge}>
                  <Text style={styles.certIdText}>{cert.certificate_id}</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: COLORS.success + '20' }]}>
                  <Text style={[styles.typeText, { color: COLORS.success }]}>
                    {cert.certificate_type === 'completion' ? 'Completion' : 'Excellence'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.downloadButton}
                onPress={() => handleDownloadCertificate(cert)}
                disabled={downloading === cert.id}
              >
                {downloading === cert.id ? (
                  <ActivityIndicator size="small" color={COLORS.gold} />
                ) : (
                  <>
                    <Ionicons name="download" size={18} color={COLORS.gold} />
                    <Text style={styles.downloadText}>Download PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="ribbon-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No certificates yet</Text>
            <Text style={styles.emptySubtext}>Certificates will appear here when issued</Text>
          </View>
        )}
      </ScrollView>

      {/* Create Certificate Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Issue Certificate</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.formLabel}>Student</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={formData.student_id}
                  onValueChange={(value) => setFormData({ ...formData, student_id: value })}
                  style={styles.picker}
                  dropdownIconColor={COLORS.gold}
                >
                  <Picker.Item label="Select student" value="" />
                  {students.map((student) => (
                    <Picker.Item
                      key={student.id}
                      label={`${student.first_name} ${student.last_name} (${student.student_id})`}
                      value={student.id}
                    />
                  ))}
                </Picker>
              </View>

              <Text style={styles.formLabel}>Course</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={formData.course_id}
                  onValueChange={(value) => setFormData({ ...formData, course_id: value })}
                  style={styles.picker}
                  dropdownIconColor={COLORS.gold}
                >
                  <Picker.Item label="Select course" value="" />
                  {courses.map((course) => (
                    <Picker.Item key={course.id} label={course.name} value={course.id} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.formLabel}>Certificate Type</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[styles.typeButton, formData.certificate_type === 'completion' && styles.typeButtonActive]}
                  onPress={() => setFormData({ ...formData, certificate_type: 'completion' })}
                >
                  <Ionicons name="checkmark-circle" size={24} color={formData.certificate_type === 'completion' ? COLORS.marbleDark : COLORS.textSecondary} />
                  <Text style={[styles.typeButtonText, formData.certificate_type === 'completion' && styles.typeButtonTextActive]}>Completion</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, formData.certificate_type === 'excellence' && styles.typeButtonActive]}
                  onPress={() => setFormData({ ...formData, certificate_type: 'excellence' })}
                >
                  <Ionicons name="star" size={24} color={formData.certificate_type === 'excellence' ? COLORS.marbleDark : COLORS.textSecondary} />
                  <Text style={[styles.typeButtonText, formData.certificate_type === 'excellence' && styles.typeButtonTextActive]}>Excellence</Text>
                </TouchableOpacity>
              </View>

              <Button title="Issue Certificate" onPress={handleCreateCertificate} style={{ marginTop: SIZES.lg }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  headerTitle: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  headerSubtitle: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  addButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
  statsContainer: { padding: SIZES.md },
  statCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.lg, alignItems: 'center', ...SHADOWS.small },
  statValue: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.gold, marginTop: SIZES.sm },
  statLabel: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  content: { flex: 1, paddingHorizontal: SIZES.md },
  certificateCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.md, borderWidth: 2, borderColor: COLORS.gold + '40', ...SHADOWS.small },
  certificateHeader: { flexDirection: 'row', alignItems: 'center' },
  certificateIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  certificateInfo: { flex: 1 },
  certificateStudent: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  certificateCourse: { fontSize: SIZES.fontSm, color: COLORS.gold, marginTop: SIZES.xs },
  certificateDate: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 2 },
  certificateMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SIZES.md, paddingTop: SIZES.md, borderTopWidth: 1, borderTopColor: COLORS.marbleGray },
  certIdBadge: { backgroundColor: COLORS.backgroundLight, paddingHorizontal: SIZES.sm, paddingVertical: 4, borderRadius: SIZES.radiusSm },
  certIdText: { fontSize: SIZES.fontXs, color: COLORS.textTertiary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  typeBadge: { paddingHorizontal: SIZES.sm, paddingVertical: 4, borderRadius: SIZES.radiusSm },
  typeText: { fontSize: SIZES.fontXs, fontWeight: '600' },
  downloadButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold + '20', paddingVertical: SIZES.md, borderRadius: SIZES.radiusMd, marginTop: SIZES.md, gap: SIZES.xs },
  downloadText: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.gold },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontMd, color: COLORS.textTertiary, marginTop: SIZES.md },
  emptySubtext: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: '85%', paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalForm: { padding: SIZES.lg },
  formLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.xs, marginTop: SIZES.sm },
  pickerContainer: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, overflow: 'hidden', marginBottom: SIZES.md },
  picker: { color: COLORS.textPrimary },
  typeSelector: { flexDirection: 'row', gap: SIZES.sm },
  typeButton: { flex: 1, alignItems: 'center', paddingVertical: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundLight, borderWidth: 1, borderColor: COLORS.marbleGray },
  typeButtonActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  typeButtonText: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  typeButtonTextActive: { color: COLORS.marbleDark, fontWeight: '600' },
});
