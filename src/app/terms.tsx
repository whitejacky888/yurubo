/**
 * terms.tsx ― 利用規約・プライバシーポリシーの画面
 * 文章は src/constants/terms.ts にまとめています。
 */
import { StyleSheet } from 'react-native';

import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { Txt } from '../components/Txt';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type TermsSection } from '../constants/terms';

/** 見出しと段落を並べて表示する小さな部品 */
function Sections({ sections }: { sections: TermsSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <Card key={section.heading} style={styles.card}>
          <Txt variant="bold">{section.heading}</Txt>
          {section.body.map((paragraph) => (
            <Txt key={paragraph} style={styles.paragraph}>{paragraph}</Txt>
          ))}
        </Card>
      ))}
    </>
  );
}

export default function TermsScreen() {
  return (
    <Screen edges={['bottom']}>
      <Txt variant="title">利用規約</Txt>
      <Sections sections={TERMS_OF_SERVICE} />
      <Txt variant="title" style={styles.second}>プライバシーポリシー</Txt>
      <Sections sections={PRIVACY_POLICY} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: 6 },
  paragraph: { marginTop: 6, fontSize: 14, lineHeight: 22 },
  second: { marginTop: 24 },
});
