/**
@licence
Copyright (c) 2018 Tehnode Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.  */
import { PolymerElement } from '@polymer/polymer/polymer-element.js';
import * as Async from '@polymer/polymer/lib/utils/async.js';
import { Debouncer } from '@polymer/polymer/lib/utils/debounce.js';


class OstinatoFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}


class InvalidOriginError extends OstinatoFetchError {
  constructor() {
    super("Ostinato-fetch is not allowed to make requests to another origin.");
  }
}


/**
* `ostinato-fetch`
* Fetch and replace html fragments
*
* @customElement
* @polymer
* @demo demo/index.html
*/
class OstinatoFetch extends PolymerElement {
  static get properties() {
    return {
      /**
      * A comma separated list of target element selectors which
      * should receive the new content.
      * If these nodes exist in the response content, then it will
      * be extracted directly from the response.
      */
      targetSelectors: String,

      /**
      * The http method to use for the request
      */
      method: {
        type: String,
        value: 'get'
      },

      /**
      * The contenttype to use for the request
      */
      contentType: {
        type: String,
        value: null
      },

      /**
      * Set to true if you don't want to run any imports that the
      * new content might have in <head>
      */
      skipImports: {
        type: Boolean,
        value: false
      },

      /**
      * Whether or not to update the browser history when this
      * component is used.
      */
      updateHistory: {
        type: Boolean,
        value: false
      },

      /**
        * If the requests being made is relative urls, then you need
        * to specify what baseURL the fetched urld are relative to
        */
      baseUrl: {
        type: String,
        value: () => { return window.location.origin; }
      }
    };
  }

  ready() {
    super.ready();

    if (this.updateHistory) {
      // Set the initial history state route
      window.addEventListener('popstate', (ev) => {
        if (ev.state) {
          /*
            Only generate the request if the urls actually
            changed.
            Compare the urls without any hash values.
            This is because we don't want a hash to generate
            a request. Hash changes are only for on page
            anchors.
          */
          var stateUrl = new URL(ev.state.url, this.baseUrl);
          var url = new URL(this._url, this.baseUrl);
          if (url.pathname != stateUrl.pathname) {
            this.fetch(stateUrl.pathname);
          }
        }
      });
    }
  }

  /**
    * Make a request using the fetch api instead of XMLHttpRequest
    */
  fetch(url, options) {
    var _options = Object.assign({
      method: this.method,
      redirect: 'follow',
      credentials: 'same-origin',
    }, options);

    this._fetchDebounce = Debouncer.debounce(
      this._fetchDebounce,
      Async.microTask, () => {
        this._url = new URL(url, this.baseUrl);

        if (this._url.origin === window.location.origin) {
          fetch(url, _options)
            .then((resp) => {
              // Detect 404 and raise appropriate error here.
              this.dispatchEvent(new CustomEvent('request-completed', {
                detail: { response: resp }
              }));
              return resp.text();
            })
            .then((text) => { this._updateContent(text); })
            .catch((err) => {
              this.dispatchEvent(new CustomEvent('error', {detail: err}));
            });
            this.dispatchEvent(new CustomEvent('request-started', {
              detail: {requestUrl: this._url}
            }))
        } else {
          throw new InvalidOriginError();
        }
      }
    );
  }

  _updateContent(content) {
    if (content) {
      const doc = new DOMParser().parseFromString(content, "text/html");
      const targetSelectorList = this.targetSelectors.split(',');
      this._insertContent(doc, targetSelectorList);
      this.dispatchEvent(new CustomEvent('content-updated'));
    } // TODO: Replace with previous content?
  }

  _insertContent(doc, targetSelectorList) {
    targetSelectorList.forEach((targetSelector) => {
      var target = document.querySelector(targetSelector);
      var content = doc.querySelector(targetSelector);
      if (content) { target.innerHTML = content.innerHTML; }
    });
  }

  /**
    * You should manually call this method when your want to update
    * the browser history.
    *
    * The `context` object is optional and can be any javascript
    * object or a DOM element.
    *
    * This context is then sent along to the `history-updated` and
    * `context-attached` events, so that you can then use that to do
    * any other tasks related to the page context.
    */
  /** TODO: Is this overly complicated? Can we simplify?
    * Can we move some of thie in the fetch promises?
    * Maybe some of the tasks here should be done with the
    * request-completed event?
    */
  setContext(pageTitle, context) {
    // Context is a js object with methods that can override
    // defaults we have here to return
    var url = new URL(this._url, this.baseUrl);

    if (this.updateHistory && this._url) {
      var currentState = window.history.state;
      var state = {
        title: pageTitle,
        url: url.pathname
      };

      // Only push the state if it actually changed
      if ((!currentState) || (state.url != window.history.state.url)) {
        window.history.pushState(state, pageTitle, url.pathname);
      }

      // Due to a bug in many browsers, history api doesn't
      // always update the title.
      // do so manually here till this is fixed in browsers.
      document.title = pageTitle;

      this.dispatchEvent(new CustomEvent('history-updated', {
        detail: {
          title: state.title,
          url: url,
          context: context
        }
      }));
    }
    this.dispatchEvent(new CustomEvent('context-attached', {
      detail: { context: context }
    }));
  }
}

customElements.define('ostinato-fetch', OstinatoFetch);


/**
 * `ostinato-fetch-triggers`
 * Use this element to specify which elements should behave as ostinato-fetch
 * triggers.
 */
class OstinatoFetchTriggers extends PolymerElement {
  static get properties() {
    return {
      /**
        * The query selector for the `ostinato-fetch` element to use when
        * making the request.
        */
      xhrSelector: {
        type: String,
        value: "#xhrContent"
      },

      triggerSelector: {
        type: String,
        value: "[xhr-link]"
      }
    };
  }

  ready() {
    super.ready();

    var triggerList = document.querySelectorAll(this.triggerSelector);
    if (triggerList) {
      triggerList.forEach((trigger) => {
        trigger.addEventListener('click', (ev) => {
          ev.preventDefault();
          this.triggerRequest(ev.currentTarget.href);
        });
      });
    }
  }

  triggerRequest(href) {
    document.querySelector(this.xhrSelector).fetch(href);
  }
}

customElements.define('ostinato-fetch-triggers', OstinatoFetchTriggers);
