// Pure face-descriptor comparison used to verify a clock-in selfie against an
// employee's registered reference face. No DB/Express dependency — stays
// directly unit-testable (mirrors server/geo-distance.cjs).
//
// Descriptors are 128-length float arrays produced client-side by
// @vladmandic/face-api's recognition net. 0.6 is that library's own
// recommended match threshold for its descriptor space.

const FACE_DESCRIPTOR_LENGTH = 128;
const FACE_MATCH_THRESHOLD = 0.6;

function isValidFaceDescriptor(value) {
    return (
        Array.isArray(value) &&
        value.length === FACE_DESCRIPTOR_LENGTH &&
        value.every((n) => typeof n === 'number' && Number.isFinite(n))
    );
}

function euclideanDistance(a, b) {
    let sumSquares = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sumSquares += diff * diff;
    }
    return Math.sqrt(sumSquares);
}

module.exports = { FACE_DESCRIPTOR_LENGTH, FACE_MATCH_THRESHOLD, isValidFaceDescriptor, euclideanDistance };
