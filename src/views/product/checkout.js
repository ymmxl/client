import {inject} from 'aurelia-framework';
import {Api} from '~/services/api';
import {UserService} from '~/services/user';
import {Router} from 'aurelia-router';
import {constants} from '~/services/constants';
import {UploadService} from '~/services/upload';

@inject(Router, Api, UserService, UploadService)
export class CheckoutVM {
  error = {};
  request = {
    shipping_address: {}
  };
  cards = [];

  constructor(router, api, user, upload) {
    this.router = router;
    this.api = api;
    this.user = user.user;
    this.upload = upload;
    this.constants = constants;

    this.state = {
      addcard: false
    };
  }

  activate(params) {
    this.api.fetch('countries')
      .then(countries => this.countries = countries.results)
      .catch(err => console.log(err));

    this.api.fetch('me/cards')
      .then(cards => {
        if (cards.data) {
          this.cards = cards.data;
        }
      })
      .catch(err => console.log(err));

    this.getProduct(Number(params.product_id), params);
  }

  getProduct(id, selections) {
    this.api
      .fetch(`products/${id}`)
      .then(product => {
        this.product = product;
        const currentDay = new Date(Date.now());
        const deliveryDate = new Date(currentDay.setDate(currentDay.getDate() + 7 * product.delivery_time));
        this.request = {
          source_id: product.source_id,
          base_price: product.price,
          postage: 0,
          destination_id: this.user && this.user.country_id || constants.defaultDestination,
          collection_method: 'pickup',
          count: Number(selections.count),
          shipping_address: constants.defaultShippingAddress || {},
          delivery_date: deliveryDate.toISOString()
        };
        this.selectOptions(selections);
        this.getPrice();
      })
      .catch(error => {
        console.log(error);
        this.error.product = error;
      });
  }

  charge(token) {
    this.state.inflight = true;
    this.saveAddress(this.request.shipping_address);
    this.saveCountry(this.request.destination_id);
    (token ? this.api.create('me/cards', {token}) : Promise.resolve())
      .then(res => {
        const cardId = (res && res.card_id) || this.card;
        return this.api
          .create('me/charge', {amount: this.request.total_price, currency: 'SGD', source: cardId});
      })
      .then(response => {
        this.request.stripe_charge_id = response.id;
        return this.api.create(`products/${this.product.id}/requests`, this.request);
      })
      .then(this.confirmPurchase.bind(this))
      .catch(error => {
        this.state.inflight = false;
        // send error to admin
        console.log(error);
      });
  }

  confirmPurchase() {
    return this.api.edit(`products/${this.product.id}`, {order_count: this.product.order_count ? this.product.order_count + 1 : 1})
      .then(response => {
        this.router.navigateToRoute('acknowledge');
      });
  }

  saveAddress(address) {
    if (address.line_1 === constants.defaultShippingAddress.line_1) {
      return;
    }

    if (this.user && !this.user.address) {
      this.user.address = address;
      this.api.edit('me', { address: address })
        .then(success => console.log(success));
    }
  }

  saveCountry(countryId) {
    if (!this.user.country_id) {
      this.user.country_id = countryId;
      this.api.edit('me', { country_id: countryId })
        .then(success => console.log(success));
    }
  }

  toggleAddress() {
    if (this.request.collection_method === 'pickup') {
      this.request.shipping_address = this.constants.defaultShippingAddress;
      this.request.postage = 0;
    } else {
      this.request.shipping_address = this.user && this.user.address;
      this.request.postage = this.product.postage || constants.defaultPostage;
    }
    this.getPrice();
  }

  togglePaymentView(toggle) {
    this.currentPaymentMethod = this.currentPaymentMethod === toggle ? '' : toggle;
  }

  saveProof() {
    this.request.status = 'pending';
    this.state.inflight = true;
    this.upload.uploadImages(this.proof, 'proof')
      .then(streams => {
        this.request.proof = streams.map(stream => stream.url.split('?')[0]);
        return this.api.create(`products/${this.product.id}/requests`, this.request);
      })
      .then(this.confirmPurchase.bind(this))
      .catch(err => console.log(err));
  }

  selectOptions(selections) {
    if (selections.color) this.request.color = this.product.colors[selections.color];
    if (selections.size) this.request.size = this.product.sizes[selections.size];
    if (selections.edition) this.request.edition = this.product.editions[selections.edition];
  }

  getPrice() {
    this.request.total_price = this.request.count * (this.product.price + this.getDelta(this.request)) + this.request.postage;
  }

  getDelta(request) {
    let delta = 0;
    if (request.size && request.size.delta) {
      delta = delta + request.size.delta;
    }
    if (request.color && request.color.delta) {
      delta = delta + request.color.delta;
    }
    if (request.edition && request.edition.delta) {
      delta = delta + request.edition.delta;
    }
    return delta;
  }
}
