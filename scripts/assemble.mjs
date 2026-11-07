export const APPENDIX_MARKER = '<!-- GENERATED_BUILD_APPENDIX -->';

export function replaceAppendix(source, inventory) {
  const count = source.split(APPENDIX_MARKER).length - 1;
  if (count === 0) {
    throw new Error(`report.md is missing the generated-build-appendix marker:\n  ${APPENDIX_MARKER}`);
  }
  if (count > 1) {
    throw new Error(`report.md contains ${count} generated-build-appendix markers; expected exactly one:\n  ${APPENDIX_MARKER}`);
  }
  return source.replace(APPENDIX_MARKER, () => inventory);
}
