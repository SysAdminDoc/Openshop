import 'vitest-canvas-mock';

if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:openshop-test';
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}
