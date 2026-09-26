// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "supabase/functions/*"],
  },
  {
    rules: {
      // react/no-unescaped-entities exists because a raw ' or " in JSX can
      // break HTML parsing in some server-rendered setups. React Native has
      // no HTML parser -- <Text>you're</Text> renders exactly right -- so
      // every one of these is a false positive here.
      //
      // It was reporting 36 ERRORS, which made `expo lint` exit non-zero and
      // buried anything real. Escaping 36 apostrophes to satisfy a web rule
      // would have made the source harder to read for no benefit.
      "react/no-unescaped-entities": "off",

      // React Compiler rules that arrived with eslint-plugin-react-hooks 7
      // (Expo SDK 57). They flag 66 existing spots; warn until those are fixed.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);
