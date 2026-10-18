import json

from fieldmaps_api.domain.form_engine import Answers
from fieldmaps_api.domain.forms import (
    AnswerError,
    PublishedFormBoundsError,
    StoredFormDefinition,
    validate_answers,
)
from fieldmaps_api.errors import ValidationFailedError


def validated_answers(definition: StoredFormDefinition, answers: Answers) -> str:
    try:
        normalized = validate_answers(definition, answers)
    except PublishedFormBoundsError as error:
        failure = ValidationFailedError(str(error), field="answers")
        failure.details["issues"] = [{"code": "published_form_bounds"}]
        raise failure from error
    except AnswerError as error:
        raise ValidationFailedError(str(error), field="answers") from error
    return json.dumps(normalized, sort_keys=True)
