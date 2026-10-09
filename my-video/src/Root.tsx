import { Composition, Folder } from "remotion";
import { Cena1Gancho } from "./cenas/Cena1Gancho";
import { Cena2Caos } from "./cenas/Cena2Caos";
import { Cena3Tetris } from "./cenas/Cena3Tetris";
import { Cena4Rota } from "./cenas/Cena4Rota";
import { Cena5Final } from "./cenas/Cena5Final";
import { sextaDefaults, sextaSchema } from "./schema";
import { Sexta1947 } from "./Sexta1947";

const base = {
  fps: 30,
  width: 1080,
  height: 1920,
  schema: sextaSchema,
  defaultProps: sextaDefaults,
} as const;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Sexta1947" component={Sexta1947} durationInFrames={600} {...base} />
      <Folder name="Cenas">
        <Composition id="Cena1-Gancho" component={Cena1Gancho} durationInFrames={70} {...base} />
        <Composition id="Cena2-Caos" component={Cena2Caos} durationInFrames={132} {...base} />
        <Composition id="Cena3-Tetris" component={Cena3Tetris} durationInFrames={162} {...base} />
        <Composition id="Cena4-Rota" component={Cena4Rota} durationInFrames={130} {...base} />
        <Composition id="Cena5-Final" component={Cena5Final} durationInFrames={150} {...base} />
      </Folder>
    </>
  );
};
