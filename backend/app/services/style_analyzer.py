import re
from typing import Dict, Any

def analyze_style(text: str) -> Dict[str, Any]:
    """
    Analyze text style and calculate readability metrics.
    """
    if not text.strip():
        return {
            "avg_sentence_length": 0.0,
            "vocabulary_diversity": 0.0,
            "readability_score": 0.0,
            "style_description": "Insufficient text data to analyze writing style."
        }

    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Extract sentences (split by punctuation)
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    
    # Extract words
    words = [w.strip().lower() for w in re.split(r'[^a-zA-Z\']+', text) if w.strip()]
    
    if not words or not sentences:
        return {
            "avg_sentence_length": 0.0,
            "vocabulary_diversity": 0.0,
            "readability_score": 0.0,
            "style_description": "Insufficient word count to evaluate style."
        }

    avg_sentence_length = len(words) / len(sentences)
    
    # Vocabulary diversity: Type-Token Ratio (unique words / total words)
    unique_words = set(words)
    vocabulary_diversity = len(unique_words) / len(words)
    
    # Estimate syllable count (crude proxy: number of vowels / diphthongs)
    syllable_count = 0
    for word in words:
        # Simple vowel counter
        vowels = len(re.findall(r'[aeiouy]', word))
        # Adjust for silent 'e' at end
        if word.endswith('e') and vowels > 1:
            vowels -= 1
        syllable_count += max(1, vowels)
        
    # Flesch Reading Ease score formula:
    # 206.835 - 1.015 * (total_words / total_sentences) - 84.6 * (total_syllables / total_words)
    avg_syllables_per_word = syllable_count / len(words)
    readability_score = 206.835 - 1.015 * avg_sentence_length - 84.6 * avg_syllables_per_word
    readability_score = max(0.0, min(100.0, readability_score))

    # Compile descriptive style highlights
    style_attributes = []
    if avg_sentence_length > 20:
        style_attributes.append("complex and descriptive sentence structures")
    elif avg_sentence_length < 12:
        style_attributes.append("short, punchy sentences that drive fast reading flow")
    else:
        style_attributes.append("balanced, natural sentence lengths")

    if vocabulary_diversity > 0.6:
        style_attributes.append("exceptionally high vocabulary diversity and descriptors")
    elif vocabulary_diversity < 0.4:
        style_attributes.append("straightforward, highly accessible word choice")
    else:
        style_attributes.append("solid and diverse vocabulary choice")

    if readability_score > 70:
        style_difficulty = "highly readable and conversational"
    elif readability_score < 40:
        style_difficulty = "scholarly, sophisticated, and detailed"
    else:
        style_difficulty = "accessible to a general readership"

    style_description = (
        f"The author writes with {', '.join(style_attributes)}. "
        f"The content difficulty is evaluated as {style_difficulty}."
    )

    return {
        "avg_sentence_length": round(avg_sentence_length, 1),
        "vocabulary_diversity": round(vocabulary_diversity * 100, 1), # as percentage
        "readability_score": round(readability_score, 1),
        "style_description": style_description
    }
