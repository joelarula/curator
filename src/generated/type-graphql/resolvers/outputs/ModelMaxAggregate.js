"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelMaxAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ModelMaxAggregate = class ModelMaxAggregate {
};
exports.ModelMaxAggregate = ModelMaxAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ModelMaxAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMaxAggregate.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMaxAggregate.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMaxAggregate.prototype, "source", void 0);
exports.ModelMaxAggregate = ModelMaxAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ModelMaxAggregate", {})
], ModelMaxAggregate);
