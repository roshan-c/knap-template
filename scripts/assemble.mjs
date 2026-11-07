export const APPENDIX_MARKER = '<!-- GENERATED_BUILD_APPENDIX -->';

export function replaceAppendix(source, inventory) {
  const count = source.split(APPENDIX_MARKER).length - 1;
  if (count > 1) {
    throw new Error(`report.md contains ${count} generated-build-appendix markers; expected at most one:\n  ${APPENDIX_MARKER}`);
  }
  return source.replace(APPENDIX_MARKER, () => inventory);
}
