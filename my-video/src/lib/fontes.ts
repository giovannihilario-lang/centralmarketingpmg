import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily: DISPLAY } = loadAnton("normal", {
  weights: ["400"],
  subsets: ["latin", "latin-ext"],
});

export const { fontFamily: MONO } = loadMono("normal", {
  weights: ["500", "800"],
  subsets: ["latin", "latin-ext"],
});
