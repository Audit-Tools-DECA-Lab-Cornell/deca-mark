"""Authenticate visible automatic identity answers without manufacturing capture context."""

from uuid import UUID

from fieldmaps_api.domain.form_engine import Answers, visible_questions
from fieldmaps_api.domain.forms import StoredCanonicalDefinition, StoredFormDefinition


def automatic_mismatches(
    definition: StoredFormDefinition, answers: Answers, user_id: UUID, observer: str
) -> list[str]:
    if not isinstance(definition, StoredCanonicalDefinition):
        return []
    expected = {"accountId": str(user_id), "observerCode": observer}
    return [
        question.id
        for question in visible_questions(definition, answers)
        if question.value_source in expected
        and question.id in answers
        and answers[question.id] != expected[question.value_source]
    ]
