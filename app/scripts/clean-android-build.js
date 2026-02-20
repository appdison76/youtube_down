/**
 * Android 빌드 캐시만 삭제 (gradlew clean 대신 사용)
 * - gradlew clean 시 CMake가 codegen/jni 경로를 참조하는데, clean 후엔 해당 폴더가 없어 오류 발생
 * - 이 스크립트는 .cxx, build 폴더만 지우고, 이후 expo run:android 로 전체 빌드
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const dirs = [
  path.join(appRoot, 'android', 'app', '.cxx'),
  path.join(appRoot, 'android', 'app', 'build'),
  path.join(appRoot, 'android', 'build'),
];

dirs.forEach((dir) => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
    console.log('[clean-android] Removed:', path.relative(appRoot, dir));
  }
});
console.log('[clean-android] Done. Run "npx expo run:android" to rebuild.');
