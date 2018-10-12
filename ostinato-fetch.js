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
import { LitElement } from '@polymer/lit-element';


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
    super('Ostinato-fetch is not allowed to make requests to another origin.');
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
class OstinatoFetch extends LitElement {

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
      method: String,

      /**
      * The contenttype to use for the request
      */
      contentType: String,

      /**
      * Whether or not to update the browser history when this
      * component is used.
      */
      updateHistory: Boolean,

      /**
        * If the requests being made is relative urls, then you need
        * to specify what baseURL the fetched urld are relative to
        */
      baseUrl: String
    };
  }

  constructor() {
    super();

    this.targetSelectors = '';
    this.method = 'get';
    this.contentType = '';
    this.updateHistory = false;
    this.baseUrl = window.location.origin;

    this._abortController = new AbortController();
  }

  connectedCallback() {
    super.connectedCallback();

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

    if (_options.queryParams) {
      const esc = encodeURIComponent;
      url += (url.indexOf('?') === -1 ? '?' : '&') + Object.keys(_options.queryParams)
        .map(k => esc(k) + '=' + esc(_options.queryParams[k]))
        .join('&');
      delete _options.queryParams;
    }

    this._url = new URL(url, this.baseUrl);

    if (this._url.origin === window.location.origin) {
      // Abort any exisiting request before we do anything else
      this._abortController.abort();

      let abortSignal = this._abortController.signal;
      fetch(url, _options, {abortSignal})
        .then((resp) => {
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
      }));
    } else {
      throw new InvalidOriginError();
    }
  }

  _updateContent(content) {
    if (content) {
      const doc = new DOMParser().parseFromString(content, 'text/html');
      const targetSelectorList = this.targetSelectors.split(',');
      this._insertContent(doc, targetSelectorList);
      this.dispatchEvent(new CustomEvent('content-updated', {
        detail: {
          doc: doc,
          selectors: targetSelectorList
        }
      }));
      this._updateHistoryState(doc);
    }
  }

  _insertContent(doc, targetSelectorList) {
    targetSelectorList.forEach((targetSelector) => {
      var content = doc.querySelector(targetSelector);
      var target = document.querySelector(targetSelector);

      // First empty the target container properly
      while (target.firstChild) { target.removeChild(target.firstChild); }

      // Now insert content elements
      Array.from(content.children).forEach(node => target.appendChild(node));
    });
  }

  _updateHistoryState(doc) {
    if (this.updateHistory && this._url) {
      let url = new URL(this._url, this.baseUrl);
      let currentState = window.history.state;
      let state = {
        title: doc.title,
        url: url.pathname
      };

      // Only push the state if it actually changed
      if ((!currentState) || (state.url != window.history.state.url)) {
        window.history.pushState(state, state.title, url.pathname);
      }

      // Due to a bug in some browsers, history api doesn't
      // always update the title.
      // Do so manually here till this is fixed in browsers.
      document.title = state.title;

      this.dispatchEvent(new CustomEvent('history-updated', {
        detail: {
          url: url,
          state: state,
        }
      }));
    }
  }
}

customElements.define('ostinato-fetch', OstinatoFetch);


/**
 * `ostinato-fetch-triggers`
 * Use this element to specify which elements should behave as ostinato-fetch
 * triggers.
 */
class OstinatoFetchTriggers extends LitElement {
  static get properties() {
    return {
      /**
        * The query selector for the `ostinato-fetch` element to use when
        * making the request.
        */
      xhrSelector: { type: String },

      /**
      * Elements with the trigger selector will have their click event
      * intercepted and will make the request via ostinato-fetch
      */
      triggerSelector: { type: String },
    };
  }


  constructor() {
    super();
    this.xhrSelector = '#xhrContent';
    this.triggerSelector = '[xhr-link]';
  }

  connectedCallback() {
    super.connectedCallback();
    var triggerList = document.querySelectorAll(this.triggerSelector);
    triggerList.forEach((trigger) => {
      trigger.addEventListener('click', this._handleXhrClick.bind(this));
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    var triggerList = document.querySelectorAll(this.triggerSelector);
    triggerList.forEach((trigger) => {
      trigger.removeEventListener('click', this._handleXhrClick.bind(this));
    });
  }

  _handleXhrClick(ev) {
    ev.preventDefault();
    this.triggerRequest(ev.currentTarget.href);
  }

  triggerRequest(href) {
    document.querySelector(this.xhrSelector).fetch(href);
  }
}

customElements.define('ostinato-fetch-triggers', OstinatoFetchTriggers);
