# GetDraft Rebrand - Changes Log

## February 6, 2026 - Initial Rebrand Phase

### ✅ Completed Changes

#### 1. Folder Structure
- **Renamed:** `myroster/` → `getdraft/`
- **Renamed:** `MyRoster/` → `GetDraft/` (parent folder)
- All file paths now use `getdraft` directory

#### 2. Brand Colors (`config/colors.ts`)
**Before (MyRoster):**
- Primary: Navy (#013369)
- Accent: Red (#D50A0A)
- Background: White (#FFFFFF)

**After (GetDraft):**
- Primary: Black (#121212)
- Secondary: White (#FFFFFF)
- Minimalist black & white palette
- Removed navy/red color scheme

**Changes Made:**
```typescript
// Brand Colors - GetDraft Official Palette
export const brand = {
    primary: '#121212',      // Black
    primaryLight: '#1E1E1E',
    primaryDark: '#000000',
    white: '#FFFFFF',        // White
    whiteLight: '#FAFAFA',
    whiteDark: '#F5F5F5',
    // ... rest of palette
}
```

#### 3. Splash Screen (`components/SplashScreen.tsx`)
**Changes:**
- **Background:** Changed from image background to solid black (#121212)
- **Logo:** Using white logo (`assets/logo_white.png`)
- **Simplified:** Removed ImageBackground component and overlay
- **Styles:** Cleaned up to minimal design
- **Comments:** Updated all references from "MyRoster" to "GetDraft"

**Before:**
```tsx
<ImageBackground source={images.splashBackground}>
  <View style={styles.overlay} />
  <Animated.Image source={images.logo} />
</ImageBackground>
```

**After:**
```tsx
<View style={styles.container}>
  <Animated.Image source={require('@/assets/logo_white.png')} />
</View>
```

**Styling:**
- Container: Black background (#121212)
- Logo: White tint applied
- Centered layout
- Maintained fade-in animation (800ms duration)
- Logo scale animation (0.9 → 1.0)

#### 4. Documentation
- ✅ Created `WORKFLOW.md` - Complete user workflow for all 5 roles
- ✅ Created `TODO.md` - Comprehensive implementation checklist
- ✅ Created `CHANGES.md` - This change log

---

## Visual Changes Summary

### Splash Screen Comparison

**MyRoster (Old):**
- Image background with sports theme
- Navy/white overlay
- Shield logo
- Multiple layers

**GetDraft (New):**
- Solid black background (#121212)
- White logo on transparent background
- Minimalist, clean design
- Single logo layer

---

## File Changes

### Modified Files
1. `/getdraft/config/colors.ts` - Updated brand palette
2. `/getdraft/components/SplashScreen.tsx` - Simplified and rebranded
3. `/getdraft/TODO.md` - Updated with completed tasks

### New Files
1. `/getdraft/WORKFLOW.md` - Complete app workflow documentation
2. `/getdraft/TODO.md` - Implementation task list
3. `/getdraft/CHANGES.md` - This file
4. `/getdraft/assets/logo_white.png` - New white logo asset

### Renamed
- `myroster/` → `getdraft/`
- `MyRoster/` → `GetDraft/`

---

## Next Steps

Based on `TODO.md`, the next priorities are:

### Immediate Next Steps:
1. Update `app.json` - Change name, slug, scheme to "getdraft"
2. Update `package.json` - Change project name
3. Replace remaining logo assets (logo.png, logo_text.png)
4. Update `config/assets.ts` - Update all asset references

### Phase 2:
1. Update Welcome Screen with GetDraft content
2. Update Auth Screen with new branding + 4 role options
3. Add new user roles (parent, coach) to auth system

### Phase 3:
1. Backend setup (Supabase)
2. Stripe integration
3. Core features implementation

---

## Technical Notes

### Color Palette Decision
- Chose minimalist black & white for modern, premium feel
- Black: #121212 (softer than pure black #000000)
- Provides high contrast for readability
- Timeless, professional aesthetic
- Easy to maintain and extend

### Logo Requirements
- White logo on transparent background (PNG)
- Suitable for dark backgrounds
- Scalable vector source recommended for future
- Current size: Responsive (45% of screen width)

### Breaking Changes
- ⚠️ All import paths referencing "myroster" need updating
- ⚠️ Asset paths need verification
- ⚠️ Package.json and app.json not yet updated

---

## Testing Checklist

- [x] Splash screen displays correctly
- [x] Logo animates properly (fade-in + scale)
- [x] Black background renders (#121212)
- [x] No linter errors in modified files
- [ ] App builds successfully (needs testing)
- [ ] iOS splash screen works
- [ ] Android splash screen works
- [ ] Logo renders on various screen sizes

---

## Assets Status

### ✅ Available
- `logo_white.png` - White logo for dark backgrounds

### ⏳ Needed
- `logo.png` - Main GetDraft logo (full color if any)
- `logo_text.png` - Typography/wordmark logo
- `icon.png` - App icon
- `splash-icon.png` - Splash screen icon
- `favicon.png` - Web favicon
- Android adaptive icons (background, foreground, monochrome)

---

**Last Updated:** February 6, 2026  
**Status:** Phase 1 (Foundation) - In Progress  
**Next Milestone:** Complete app configuration updates
