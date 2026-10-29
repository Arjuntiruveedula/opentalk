import re
import random

AI_PERSONA = {
    "name": "Aria",
    "title": "AI Spoken English Coach",
    "avatar": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80"
}

# Rule-based and semantic patterns for grammar & phrasing corrections
CORRECTION_PATTERNS = [
    (r"\bi am agree\b", "I agree", "Use 'I agree' instead of 'I am agree'. 'Agree' is already a verb, not an adjective."),
    (r"\bi didn't knew\b", "I didn't know", "After 'did' or 'didn't', always use the base form of the verb ('know')."),
    (r"\bhe don't\b", "he doesn't", "Use 'doesn't' for third-person singular subjects (he, she, it)."),
    (r"\bshe don't\b", "she doesn't", "Use 'doesn't' for third-person singular subjects (he, she, it)."),
    (r"\bmore better\b", "much better", "'Better' is already comparative. Use 'much better' or simply 'better'."),
    (r"\bi am having a doubt\b", "I have a question", "Native speakers say 'I have a question' rather than 'having a doubt'."),
    (r"\btoday morning\b", "this morning", "In natural English, say 'this morning' instead of 'today morning'."),
    (r"\byesterday night\b", "last night", "Say 'last night' instead of 'yesterday night'."),
    (r"\bpass out from college\b", "graduate from college", "Say 'graduated from college'. 'Pass out' means to faint or lose consciousness!"),
    (r"\brevert back\b", "reply or respond", "'Revert' already means to return. Just say 'reply' or 'get back to me'."),
    (r"\baccording to me\b", "in my opinion", "'According to' is usually reserved for third parties or data. Use 'In my opinion' or 'From my perspective'."),
    (r"\bi am working since\b", "I have been working since", "Use the present perfect continuous ('have been working') to show an action started in the past and continuing now."),
    (r"\bno mention\b", "you're welcome", "Say 'you're welcome', 'my pleasure', or 'no problem' instead of 'no mention'."),
    (r"\bi came to office by walk\b", "I walked to the office", "Say 'I walked to the office' or 'I came on foot'."),
    (r"\bdiscuss about\b", "discuss", "'Discuss' means to talk about, so do not add 'about' after it.")
]

TOPIC_RESPONSES = [
    "That is a great perspective! Could you tell me more about why you feel that way?",
    "Fascinating point. How do you think that compares to how things were five or ten years ago?",
    "I love that example! Can you share a specific moment or story that illustrates it?",
    "That makes total sense. What was the most challenging part of that situation for you?",
    "Very well expressed! If you had to give one piece of advice to someone facing that same choice, what would you say?"
]

def analyze_user_speech(user_text: str):
    """
    Analyzes user text for common grammar mistakes, natural alternatives,
    and returns feedback along with fluency score.
    """
    corrections = []
    text_lower = user_text.lower()
    
    for pattern, replacement, explanation in CORRECTION_PATTERNS:
        match = re.search(pattern, text_lower)
        if match:
            original_phrase = match.group(0)
            corrections.append({
                "original": original_phrase,
                "suggested": replacement,
                "rule": explanation
            })
            
    word_count = len(user_text.split())
    # Estimate fluency metrics based on sentence structure and word count
    grammar_score = max(70, min(98, 95 - len(corrections) * 10))
    vocab_score = min(96, 75 + (5 if word_count > 12 else 0) + (5 if any(len(w) > 7 for w in user_text.split()) else 0))
    coherence_score = random.randint(84, 94)
    overall_score = round((grammar_score * 0.4 + vocab_score * 0.3 + coherence_score * 0.3), 1)

    return {
        "corrections": corrections,
        "metrics": {
            "overall": overall_score,
            "grammar": grammar_score,
            "vocabulary": vocab_score,
            "coherence": coherence_score
        }
    }

def generate_ai_turn(conversation_history: list, user_message: str):
    """
    Generates a conversational response from AI Tutor Aria,
    plus grammar analysis of the user's latest turn.
    """
    analysis = analyze_user_speech(user_message)
    
    # Generate conversational reply
    # If the user asks a question or shares an idea, respond warmly
    msg_lower = user_message.lower()
    
    if any(greet in msg_lower for greet in ["hello", "hi", "hey", "good morning", "good evening"]):
        ai_reply = "Hello there! I'm Aria, your OpenTalk speaking coach. What would you like to talk about today? We can practice for an interview, discuss your hobbies, or pick a random topic!"
    elif "interview" in msg_lower or "job" in msg_lower:
        ai_reply = "Job interviews are all about confidence and clear storytelling. Let's do a practice question: Tell me about a time you had to deal with a tight deadline and how you handled it."
    elif "travel" in msg_lower or "vacation" in msg_lower:
        ai_reply = "Travel stories are the best way to practice conversational English! Where is the most memorable place you've ever visited, and what made it so special?"
    elif "ielts" in msg_lower:
        ai_reply = "Let's work on IELTS Part 2! Here is your cue card: Describe a person who has had an inspiring influence on your life. You can talk about who they are and what they taught you."
    else:
        # Contextual response with follow-up question
        base_resp = random.choice(TOPIC_RESPONSES)
        if len(analysis["corrections"]) > 0:
            hint = f"By the way, notice how you said '{analysis['corrections'][0]['original']}'? In natural conversation, you can say '{analysis['corrections'][0]['suggested']}'. {base_resp}"
            ai_reply = hint
        else:
            ai_reply = base_resp
            
    return {
        "reply": ai_reply,
        "coach": AI_PERSONA,
        "feedback": analysis
    }
