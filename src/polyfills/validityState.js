'use strict';

/**
 * validation messages are from Firefox source,
 * http://mxr.mozilla.org/mozilla-central/source/dom/locales/en-US/chrome/dom/dom.properties
 * released under MPL license, http://mozilla.org/MPL/2.0/.
 */


import get_next_valid from '../tools/get_next_valid';
import get_type from '../tools/get_type';
import installer from '../tools/property_installer';
import is_validation_candidate from '../tools/is_validation_candidate';
import mark from '../tools/mark';
import sprintf from '../tools/sprintf';
import string_to_number from '../tools/string_to_number';
import string_to_date from '../tools/string_to_date';
import unicode_string_length from '../tools/unicode_string_length';
import _ from '../components/localization';
import message_store from '../components/message_store';
import Registry from '../components/registry';
import { get_wrapper } from '../components/wrapper';
import test_max from '../validators/max';
import test_maxlength from '../validators/maxlength';
import test_min from '../validators/min';
import test_minlength from '../validators/minlength';
import test_pattern from '../validators/pattern';
import test_required from '../validators/required';
import test_step from '../validators/step';
import test_type from '../validators/type';
import test_bad_input from '../validators/bad_input';


/**
 * Implement constraint checking functionality defined in the HTML5 standard
 *
 * @see https://html.spec.whatwg.org/multipage/forms.html#dom-cva-validity
 * @return bool true if the test fails [!], false otherwise
 */
const validity_state_checkers = {
  badInput: element => {
    const invalid = ! test_bad_input(element);
    if (invalid) {
      message_store.set(element, _('Please match the requested type.'));
    }
    return invalid;
  },

  customError: element => {
    /* check, if there are custom validators in the registry, and call
     * them. */
    const custom_validators = Registry.get(element);
    var valid = true;

    if (custom_validators.length) {
      for (const validator of custom_validators) {
        const result = validator(element);
        if (result !== undefined && ! result) {
          valid = false;
          /* break on first invalid response */
          break;
        }
      }
    }

    /* check, if there are other validity messages already */
    if (valid) {
      const msg = message_store.get(element);
      valid = ! (msg.toString() && ('is_custom' in msg));
    }

    return ! valid;
  },

  patternMismatch: element => {
    const invalid = ! test_pattern(element);
    if (invalid) {
      message_store.set(element,
        element.title?
          sprintf(_('PatternMismatchWithTitle'), element.title)
          :
          _('PatternMismatch')
      );
    }
    return invalid;
  },

  rangeOverflow: element => {
    const invalid = ! test_max(element);
    const type = get_type(element);

    if (invalid) {
      let msg;
      switch (type) {
        case 'date':
        case 'datetime':
        case 'datetime-local':
          msg = sprintf(_('DateRangeOverflow'),
                        string_to_date(element.getAttribute('max'), type));
          break;
        case 'time':
          msg = sprintf(_('TimeRangeOverflow'),
                        string_to_date(element.getAttribute('max'), type));
          break;
        // case 'number':
        default:
          msg = sprintf(_('NumberRangeOverflow'),
                        string_to_number(element.getAttribute('max'), type));
          break;
      }
      message_store.set(element, msg);
    }

    return invalid;
  },

  rangeUnderflow: element => {
    const invalid = ! test_min(element);
    const type = get_type(element);

    if (invalid) {
      let msg;
      switch (type) {
        case 'date':
        case 'datetime':
        case 'datetime-local':
          msg = sprintf(_('DateRangeUnderflow'),
                        string_to_date(element.getAttribute('max'), type));
          break;
        case 'time':
          msg = sprintf(_('TimeRangeUnderflow'),
                        string_to_date(element.getAttribute('max'), type));
          break;
        // case 'number':
        default:
          msg = sprintf(_('NumberRangeUnderflow'),
                        string_to_number(element.getAttribute('max'), type));
          break;
      }
      message_store.set(element, msg);
    }

    return invalid;
  },

  stepMismatch: element => {
    const invalid = ! test_step(element);

    if (invalid) {
      let [min, max] = get_next_valid(element);
      let sole = false;

      if (min === null) {
        sole = max;
      } else if (max === null) {
        sole = min;
      }

      if (sole !== false) {
        message_store.set(element, sprintf(_('StepMismatchOneValue'), sole));
      } else {
        message_store.set(element, sprintf(_('StepMismatch'), min, max));
      }
    }

    return invalid;
  },

  tooLong: element => {
    const invalid = ! test_maxlength(element);

    if (invalid) {
      message_store.set(element,
        sprintf(_('TextTooLong'), element.getAttribute('maxlength'),
                unicode_string_length(element.value)));
    }

    return invalid;
  },

  tooShort: element => {
    const invalid = ! test_minlength(element);

    if (invalid) {
      message_store.set(element,
        sprintf(_('Please lengthen this text to %l characters or more (you are currently using %l characters).'),
                element.getAttribute('maxlength'),
                unicode_string_length(element.value)));
    }

    return invalid;
  },

  typeMismatch: element => {
    const invalid = ! test_type(element);

    if (invalid) {
      let msg = _('Please use the appropriate format.');
      const type = get_type(element);

      if (type === 'email') {
        if (element.hasAttribute('multiple')) {
          msg = _('Please enter a comma separated list of email addresses.');
        } else {
          msg = _('InvalidEmail');
        }
      } else if (type === 'url') {
        msg = _('InvalidURL');
      } else if (type === 'file') {
        msg = _('Please select a file of the correct type.');
      }
      message_store.set(element, msg);
    }

    return invalid;
  },

  valueMissing: element => {
    const invalid = ! test_required(element);

    if (invalid) {
      let msg = _('ValueMissing');
      const type = get_type(element);

      if (type === 'checkbox') {
        msg = _('CheckboxMissing');
      } else if (type === 'radio') {
        msg = _('RadioMissing');
      } else if (type === 'file') {
        if (element.hasAttribute('multiple')) {
          msg = _('Please select one or more files.');
        } else {
          msg = _('FileMissing');
        }
      } else if (element instanceof window.HTMLSelectElement) {
        msg = _('SelectMissing');
      }
      message_store.set(element, msg);
    }

    return invalid;
  },

};


/**
 * the validity state constructor
 */
var ValidityState = function(element) {
  if (! (element instanceof window.HTMLElement)) {
    throw new Error('cannot create a ValidityState for a non-element');
  }

  const cached = ValidityState.cache.get(element);
  if (cached) {
    return cached;
  }

  if (! (this instanceof ValidityState)) {
    /* working around a forgotten `new` */
    return new ValidityState(element);
  }

  this.element = element;
  ValidityState.cache.set(element, this);
};


/**
 * the prototype for new validityState instances
 */
var ValidityStatePrototype = {};
ValidityState.prototype = ValidityStatePrototype;

ValidityState.cache = new WeakMap();

/**
 * copy functionality from the validity checkers to the ValidityState
 * prototype
 */
for (let prop in validity_state_checkers) {
  Object.defineProperty(ValidityStatePrototype, prop, {
    configurable: true,
    enumerable: true,
    get: (func => function() {
      return func(this.element);
    })(validity_state_checkers[prop]),
    set: undefined,
  });
}

/**
 * the "valid" property calls all other validity checkers and returns true,
 * if all those return false.
 *
 * This is the major access point for _all_ other API methods, namely
 * (check|report)Validity().
 */
Object.defineProperty(ValidityStatePrototype, 'valid', {
  configurable: true,
  enumerable: true,
  get: function() {
    const wrapper = get_wrapper(this.element);
    const validClass = wrapper && wrapper.settings.classes.valid || 'hf-valid';
    const invalidClass = wrapper && wrapper.settings.classes.invalid || 'hf-invalid';
    const validatedClass = wrapper && wrapper.settings.classes.validated || 'hf-validated';

    this.element.classList.add(validatedClass);

    if (is_validation_candidate(this.element)) {
      for (let prop in validity_state_checkers) {
        if (validity_state_checkers[prop](this.element)) {
          this.element.classList.add(invalidClass);
          this.element.classList.remove(validClass);
          this.element.setAttribute('aria-invalid', 'true');
          return false;
        }
      }
    }

    message_store.delete(this.element);
    this.element.classList.remove(invalidClass);
    this.element.classList.add(validClass);
    this.element.setAttribute('aria-invalid', 'false');
    return true;
  },
  set: undefined,
});

mark(ValidityStatePrototype);


/**
 * publish a convenience function to replace the native element.validity
 */
ValidityState.install = installer('validity', {
  configurable: true,
  enumerable: true,
  get: function() { return ValidityState(this); },
});


export default ValidityState;
