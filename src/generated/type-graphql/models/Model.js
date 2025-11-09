"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Model = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelCount_1 = require("../resolvers/outputs/ModelCount");
let Model = class Model {
};
exports.Model = Model;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], Model.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], Model.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], Model.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], Model.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCount_1.ModelCount, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelCount_1.ModelCount)
], Model.prototype, "_count", void 0);
exports.Model = Model = tslib_1.__decorate([
    TypeGraphQL.ObjectType("Model", {})
], Model);
