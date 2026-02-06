/**
 * Asset references for the MyRoster app
 * Centralized asset management for images, icons, and other static resources
 */

// Images
export const images = {
    // App Icons & Branding
    icon: require('@/assets/images/icon.png'),
    favicon: require('@/assets/images/favicon.png'),
    splashIcon: require('@/assets/images/splash-icon.png'),

    // Android Specific
    androidIconBackground: require('@/assets/images/android-icon-background.png'),
    androidIconForeground: require('@/assets/images/android-icon-foreground.png'),
    androidIconMonochrome: require('@/assets/images/android-icon-monochrome.png'),

    // MyRoster Branding
    logo: require('@/assets/logo_black.png'),
    logoWhite: require('@/assets/logo_white.png'),
    splashBackground: require('@/assets/image.png'),
    welcomeHero: require('@/assets/unnamed.jpg'),
    welcomeBg: require('@/assets/welcome_bg.png'),
    authBackground: require('@/assets/auth.png'),

    // Welcome Screen Players
    welcome1: require('@/assets/welcome1.png'),
    welcome2: require('@/assets/welcome2.png'),
    welcome3: require('@/assets/welcome3.png'),

    // Athlete profiles
    athlete1: require('@/assets/athlete1.jpg'),
    athlete2: require('@/assets/athlete2.jpg'),

    // Logos (legacy)
    reactLogo: require('@/assets/images/react-logo.png'),
    partialReactLogo: require('@/assets/images/partial-react-logo.png'),
} as const;

// Icon Sets (add custom icon mappings here)
export const icons = {
    // Tab Bar Icons
    tabHome: 'home',
    tabCalendar: 'calendar',
    tabTeam: 'users',
    tabNotifications: 'bell',
    tabSettings: 'settings',

    // Navigation
    back: 'arrow-left',
    forward: 'arrow-right',
    close: 'x',
    menu: 'menu',

    // Actions
    add: 'plus',
    edit: 'edit-2',
    delete: 'trash-2',
    save: 'check',
    cancel: 'x',
    search: 'search',
    filter: 'filter',
    sort: 'sliders',

    // User & Auth
    user: 'user',
    userPlus: 'user-plus',
    users: 'users',
    logout: 'log-out',
    login: 'log-in',

    // Status
    success: 'check-circle',
    error: 'x-circle',
    warning: 'alert-triangle',
    info: 'info',

    // Roster & Schedule
    calendar: 'calendar',
    clock: 'clock',
    shift: 'briefcase',
    swap: 'refresh-cw',

    // Communication
    message: 'message-circle',
    notification: 'bell',
    email: 'mail',
    phone: 'phone',
} as const;

// Lottie Animations (add paths to your lottie files)
export const animations = {
    // Example: loading: require('@/assets/animations/loading.json'),
} as const;

// Audio files (add paths to your audio files)
export const audio = {
    // Example: notification: require('@/assets/audio/notification.mp3'),
} as const;

// Video files (add paths to your video files)
export const videos = {
    athlete1: require('@/assets/athlete1.mp4'),
    athlete2: require('@/assets/athlete2.mp4'),
} as const;

export default {
    images,
    icons,
    animations,
    audio,
    videos,
};
