'use strict';

const paypal = require('paypal-rest-sdk');
const http = require('axios');
const qs = require('qs');

/**
 * Paypal.js controller
 *
 * @description: A set of functions called "actions" of the `paypal` plugin.
 */

module.exports = {

  /**
   * Default action.
   *
   * @return {Object}
   */

  index: async (ctx) => {
    // Add your own logic here.
    console.log(strapi.models.payments);
    let config = strapi.config.paypal;

    paypal.configure(config);

    let items = [];
    let order = await strapi.models.orders
        .findOne({ _id: ctx.query.orderId});
        order.items.forEach(x => {
            let item = {
                name: x.name,
                sku: x.id,
                price: x.price,
                currency: config.currency,
                quantity: x.qty
            }
            items.push(item);
        });
    
    var create_payment_json = {
        "intent": "sale",
        "payer": {
            "payment_method": "paypal"
        },
        "redirect_urls": {
            "return_url": "http://localhost:1337/paypal/completed",
            "cancel_url": "http://cancel.url"
        },
        "transactions": [{
            // "order_id": "xx", // post/query
            // "redirect_url": "yy", // post/query
            "item_list": {
                "items": items
            },
            "amount": {
                "currency": config.currency,
                "total": order.meta.total
            },
            "description": `Payment for orderID: ${ctx.query.orderId}`
        }]
    };


    var createPayment = new Promise(function(resolve, reject) {
      paypal.payment.create(create_payment_json, function (error, payment) {
          if (error) {
              // throw error;
              return reject(error);
          } else {
              // console.log("Create Payment Response");
              // console.log(payment);
              return resolve(payment);
          }
      });  
    });

    var payment = null;
    try {
      payment = await createPayment;
    } catch(err) {
      console.log(err);
      return ctx.send('error');
    }

    var redirect_dir = payment.links.filter(l => { return l.method === 'REDIRECT'})[0].href;
    var q = qs.parse((redirect_dir + '?').split('?')[1]);
    console.log('------------------------');
    console.log(q);

    console.log(payment);

    Payments.create({
        payID: payment.id,
        meta: {
            amount: payment.transactions[0].amount
        },
        orderId: ctx.query.orderId,
        status: "waiting for approval",
        date: new Date()
     })
    

    ctx.send(payment);
  },

  completed: async (ctx) => {
    console.log('completed');
    console.log(ctx);

    var q = qs.parse((ctx.request.url + '?').split('?')[1]);
    console.log('------------------------');
    console.log(q);

    let config = strapi.config.paypal;

    var paymentId = q.paymentId; //'PAYMENT id created in previous step';

    let pay = await Payments.findOne({payID: paymentId});

    let order = await Orders.findOne({ _id: pay.orderId});

    var execute_payment_json = {
        "payer_id": q.PayerID,
        "transactions": [{
            "amount": {
                "currency": config.currency,
                "total": order.meta.total
            }
        }]
    };
    
    let executePayment = new Promise(function(resolve, reject){
        paypal.payment.execute(paymentId, execute_payment_json, async function (error, payment) {
            if (error) {
                  return reject(error);
            } else {
                await Payments.updateOne({payID: paymentId}, {status: "completed"});
                return resolve(payment);
            }
        });
    });

    var resultPayment = null;
    try {
        resultPayment = await executePayment;
    } catch(err) {
      console.log(err);
      return ctx.send({
          error: err
      });
    }

   ctx.redirect(`${strapi.config.app.url}${strapi.config.paypal.post_payment_redirect}${order._id}`);
  },

  cancelled: async (ctx) => {
    console.log('cancelled');
    console.log(ctx);
    ctx.send({
      message: ctx
    });
  }
};
