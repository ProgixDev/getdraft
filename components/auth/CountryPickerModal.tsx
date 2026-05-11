import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, neutral } from '@/config/colors';
import { PhoneCountry, PHONE_COUNTRIES } from '@/constants/phoneCountries';

interface CountryPickerModalProps {
  visible: boolean;
  selectedIso: string;
  onSelect: (country: PhoneCountry) => void;
  onClose: () => void;
}

export const CountryPickerModal: React.FC<CountryPickerModalProps> = ({
  visible,
  selectedIso,
  onSelect,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHONE_COUNTRIES;
    return PHONE_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q.replace(/^\+/, '')) ||
        c.iso.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      onRequestClose={onClose}
      transparent={Platform.OS === 'android'}
    >
      <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? insets.top : 8 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Select country</Text>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={neutral.gray700} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={neutral.gray500} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by country or dial code"
            placeholderTextColor={neutral.gray500}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item, i) => `${item.iso}-${item.dialCode}-${i}`}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => {
            const isSelected = item.iso === selectedIso;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  isSelected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <View style={styles.isoBadge}>
                  <Text style={styles.isoBadgeText}>{item.iso}</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.dial}>+{item.dialCode}</Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={brand.primary}
                    style={styles.check}
                  />
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            fontsLoaded ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No matches.</Text>
              </View>
            ) : null
          }
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Poppins_700Bold',
    color: neutral.gray900,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: neutral.gray100,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    height: 44,
    backgroundColor: neutral.gray100,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray900,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: neutral.gray200,
    marginLeft: 64,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  rowSelected: {
    backgroundColor: 'rgba(20, 76, 156, 0.06)',
  },
  rowPressed: {
    backgroundColor: neutral.gray100,
  },
  isoBadge: {
    backgroundColor: neutral.gray100,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: neutral.gray200,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 38,
    alignItems: 'center',
  },
  isoBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    color: brand.primary,
    letterSpacing: 0.5,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
    color: neutral.gray900,
  },
  dial: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: neutral.gray600,
  },
  check: {
    marginLeft: 6,
  },
  emptyWrap: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: neutral.gray500,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
});
