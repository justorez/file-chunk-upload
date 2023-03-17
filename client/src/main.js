import Vue from "vue";
import App from "./App.vue";
import axios from "axios";
import Element from "element-ui";
import "element-ui/lib/theme-chalk/index.css";

const request = axios.create({
    baseURL: "/api",
});
request.interceptors.response.use(({ data }) => data);
Vue.prototype.$axios = request;
Vue.use(Element);

Vue.config.productionTip = false;

new Vue({
    render: (h) => h(App),
}).$mount("#app");
