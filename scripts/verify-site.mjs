import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const reviewDir = join(root, 'src/pages/reviews');
const sourceFiles = [
  join(root, 'src/pages/index.astro'),
  ...readdirSync(reviewDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(reviewDir, name)),
];

const errors = [];
const imageReferences = new Set();

for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8');
  const references = content.match(/\/images\/reviews\/[A-Za-z0-9._/-]+\.webp/g) ?? [];
  references.forEach((reference) => imageReferences.add(reference));

  if (file.endsWith('.md')) {
    const slug = file.split('/').at(-1).replace(/\.md$/, '');
    const hero = content.match(/^hero:\s*(\/images\/reviews\/[^\s]+\.webp)$/m)?.[1];

    if (!hero) {
      errors.push(`${relative(root, file)}: hero画像が設定されていません`);
    } else if (!hero.startsWith(`/images/reviews/${slug}/`)) {
      errors.push(`${relative(root, file)}: hero画像の商品フォルダが記事slugと一致しません`);
    }

    for (const imageTag of content.match(/<img\s[^>]*>/g) ?? []) {
      if (!/\salt="[^"]*"/.test(imageTag)) {
        errors.push(`${relative(root, file)}: alt属性のない画像があります`);
      }
    }
  }
}

for (const reference of imageReferences) {
  const file = join(root, 'public', reference);

  if (!existsSync(file)) {
    errors.push(`${reference}: ファイルが存在しません`);
    continue;
  }

  const size = statSync(file).size;
  const data = readFileSync(file);

  if (size < 12) {
    errors.push(`${reference}: ファイルが空または短すぎます`);
    continue;
  }

  const isWebP = data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (!isWebP) {
    errors.push(`${reference}: 正常なWebPヘッダーではありません`);
    continue;
  }

  const declaredSize = data.readUInt32LE(4) + 8;
  if (declaredSize !== size) {
    errors.push(`${reference}: WebPが途中で欠損しています（宣言 ${declaredSize} bytes / 実体 ${size} bytes）`);
  }
}

if (errors.length > 0) {
  console.error('Site verification failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Site verification passed: ${sourceFiles.length - 1} articles / ${imageReferences.size} image references`);
