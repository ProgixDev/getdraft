import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, neutral, semantic } from '@/config/colors';
import { RootState } from '@/store';
import { mockAthletes, mockAgentProfile, MediaSource } from '@/constants/discoverData';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - 48) / 3 - 8;
const VIDEO_HEIGHT = 180;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const user = useSelector((state: RootState) => state.auth.user);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const isAthlete = user?.role === 'athlete';
  const isRecruiter = user?.role === 'recruiter';
  const athleteProfile = isAthlete
    ? mockAthletes.find((a) => a.email === user?.email)
    : null;
  const agentProfile = isRecruiter && user?.email === mockAgentProfile.email
    ? mockAgentProfile
    : null;

  const profileData = athleteProfile ?? agentProfile;
  const photos: MediaSource[] = profileData?.photos ?? [];
  const videos: MediaSource[] = profileData?.videos ?? [];

  if (!fontsLoaded) return null;

  const displayName = user?.name ?? 'User';
  const roleLabel =
    user?.role === 'recruiter'
      ? 'Agent / Recruiter'
      : user?.role === 'coach'
        ? 'Coach'
        : user?.role === 'athlete'
          ? 'Athlete'
          : user?.role === 'parent'
            ? 'Parent'
            : 'User';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Pressable style={styles.editButton}>
          <Ionicons name="pencil-outline" size={22} color={brand.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarSection}>
          <View style={styles.avatarPlaceholder}>
            {photos.length > 0 ? (
              <Image
                source={typeof photos[0] === 'string' ? { uri: photos[0] } : photos[0]}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name={user?.role === 'recruiter' ? 'briefcase' : 'person'}
                size={64}
                color={neutral.gray400}
              />
            )}
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>
        </View>

        {(athleteProfile || agentProfile) && (
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>About</Text>
            {athleteProfile && (
              <>
                <View style={styles.infoRow}>
                  <Ionicons name="football" size={18} color={neutral.gray500} />
                  <Text style={styles.infoText}>
                    {athleteProfile.sport} • {athleteProfile.position}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="school" size={18} color={neutral.gray500} />
                  <Text style={styles.infoText}>{athleteProfile.level}</Text>
                </View>
              </>
            )}
            {agentProfile && (
              <>
                <View style={styles.infoRow}>
                  <Ionicons name="briefcase" size={18} color={neutral.gray500} />
                  <Text style={styles.infoText}>{agentProfile.organization}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="football" size={18} color={neutral.gray500} />
                  <Text style={styles.infoText}>{agentProfile.sport}</Text>
                </View>
              </>
            )}
            <View style={styles.infoRow}>
              <Ionicons name="location" size={18} color={neutral.gray500} />
              <Text style={styles.infoText}>{profileData?.location}</Text>
            </View>
            {profileData?.bio && (
              <Text style={styles.bio}>{profileData.bio}</Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <Pressable>
              <Text style={styles.addText}>Add</Text>
            </Pressable>
          </View>
          <View style={styles.photoGrid}>
            {photos.length > 0 ? (
              photos.map((photo, i) => (
                <View key={i} style={styles.photoItem}>
                  <Image
                    source={typeof photo === 'string' ? { uri: photo } : photo}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                </View>
              ))
            ) : (
              <View style={styles.emptyMedia}>
                <Ionicons name="images-outline" size={40} color={neutral.gray400} />
                <Text style={styles.emptyMediaText}>
                  Add photos to your profile
                </Text>
                <Pressable style={styles.addMediaButton}>
                  <Text style={styles.addMediaButtonText}>Add Photos</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Videos</Text>
            <Pressable>
              <Text style={styles.addText}>Add</Text>
            </Pressable>
          </View>
          <View style={styles.videoSection}>
            {videos.length > 0 ? (
              videos.map((uri, i) => (
                <View key={i} style={styles.videoItem}>
                  <View style={styles.videoPlaceholder}>
                    <Ionicons name="play-circle" size={48} color={brand.white} />
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyMedia}>
                <Ionicons name="videocam-outline" size={40} color={neutral.gray400} />
                <Text style={styles.emptyMediaText}>
                  Add highlight videos
                </Text>
                <Pressable style={styles.addMediaButton}>
                  <Text style={styles.addMediaButtonText}>Add Videos</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutral.gray50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: brand.white,
    borderBottomWidth: 1,
    borderBottomColor: neutral.gray200,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: brand.primary,
  },
  editButton: {
    padding: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: brand.white,
    borderRadius: 16,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: neutral.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  name: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: brand.primary,
    marginTop: 16,
  },
  roleBadge: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: neutral.gray100,
    borderRadius: 20,
  },
  roleText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    color: neutral.gray600,
  },
  infoSection: {
    backgroundColor: brand.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: brand.primary,
  },
  bio: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray600,
    marginTop: 12,
    lineHeight: 22,
  },
  section: {
    backgroundColor: brand.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.primary,
  },
  addText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.primary,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: neutral.gray200,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  videoSection: {
    gap: 12,
  },
  videoItem: {
    height: VIDEO_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: neutral.gray200,
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutral.gray300,
  },
  emptyMedia: {
    alignItems: 'center',
    paddingVertical: 32,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: neutral.gray300,
    borderRadius: 12,
  },
  emptyMediaText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray500,
    marginTop: 12,
  },
  addMediaButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: brand.primary,
    borderRadius: 20,
  },
  addMediaButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
  },
});
